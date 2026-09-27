/* Answer outbox for low-bandwidth schools. Each placement is written to
   IndexedDB first (one entry per attempt+item, newest wins), then PUT.
   Anything that fails with a network error stays queued and is flushed on
   `online`, on an interval, and on the next page load. A 4xx is final and dropped. */
import type { AnswerPut } from '../model/types';
import { ApiError, api } from './client';

export interface QueuedAnswer { key: string; attemptId: string; itemId: string; body: AnswerPut; queuedAt: number }

interface Store {
  put(e: QueuedAnswer): Promise<void>;
  del(key: string): Promise<void>;
  all(): Promise<QueuedAnswer[]>;
}

const DB = 'thisai-teacher-assessment';
const OS = 'answer-outbox';

function idbStore(): Store | null {
  if (typeof indexedDB === 'undefined') return null;
  let dbp: Promise<IDBDatabase> | null = null;
  const db = () =>
    (dbp ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(OS, { keyPath: 'key' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  const tx = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => {
    const d = await db();
    return new Promise<T>((resolve, reject) => {
      const r = fn(d.transaction(OS, mode).objectStore(OS));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  };
  return {
    put: async (e) => { await tx('readwrite', (s) => s.put(e)); },
    del: async (k) => { await tx('readwrite', (s) => s.delete(k)); },
    all: () => tx('readonly', (s) => s.getAll() as IDBRequest<QueuedAnswer[]>),
  };
}

function memoryStore(): Store {
  const m = new Map<string, QueuedAnswer>();
  return { put: async (e) => void m.set(e.key, e), del: async (k) => void m.delete(k), all: async () => [...m.values()] };
}

type Listener = (pending: number, lastError: string | null) => void;

export class AnswerOutbox {
  private store: Store;
  private flushing: Promise<void> | null = null;
  private listeners = new Set<Listener>();
  private pending = 0;
  private lastError: string | null = null;

  constructor(store?: Store, private send = api.putAnswer) {
    this.store = store ?? idbStore() ?? memoryStore();
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.pending, this.lastError);
    return () => void this.listeners.delete(fn);
  }
  private emit() { for (const l of this.listeners) l(this.pending, this.lastError); }

  async enqueue(attemptId: string, itemId: string, body: AnswerPut) {
    const key = attemptId + '|' + itemId;
    try {
      await this.store.put({ key, attemptId, itemId, body, queuedAt: Date.now() });
    } catch {
      // Storage can be unavailable (private mode); fall back to sending directly.
      this.store = memoryStore();
      await this.store.put({ key, attemptId, itemId, body, queuedAt: Date.now() });
    }
    return this.flush();
  }

  async count() { return (await this.store.all()).length; }

  flush(): Promise<void> {
    if (this.flushing) return this.flushing.then(() => this.flush());
    this.flushing = (async () => {
      const all = (await this.store.all()).sort((a, b) => a.queuedAt - b.queuedAt);
      this.pending = all.length;
      this.emit();
      for (const e of all) {
        try {
          await this.send(e.attemptId, e.itemId, e.body);
          const latest = (await this.store.all()).find((x) => x.key === e.key);
          if (latest && latest.queuedAt === e.queuedAt) await this.store.del(e.key);
          this.lastError = null;
        } catch (err) {
          if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429) {
            await this.store.del(e.key); // final: locked, invalid or forbidden
            this.lastError = err.message;
          } else {
            this.lastError = 'offline';
            break; // keep order; retry later
          }
        }
      }
      this.pending = (await this.store.all()).length;
      this.emit();
    })().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  /** Flush on reconnect and every 15s while anything is queued. */
  start() {
    const onOnline = () => void this.flush();
    window.addEventListener('online', onOnline);
    const t = window.setInterval(() => { if (this.pending) void this.flush(); }, 15000);
    void this.flush();
    return () => { window.removeEventListener('online', onOnline); window.clearInterval(t); };
  }
}

export const outbox = new AnswerOutbox();
