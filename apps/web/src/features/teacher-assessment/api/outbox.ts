/* Answer outbox for low-bandwidth schools. Each placement is written to
   IndexedDB first (one entry per attempt+item, newest wins), then PUT.
   Anything that fails with a network error stays queued and is flushed on
   `online`, on an interval, and on the next page load. Final 4xx responses are
   dropped; 401, 408 and 429 are retained for sign-in/retry. */
import type { AnswerPut } from '../model/types';
import { ApiError, api } from './client';
import { isSupabase } from '../model/config';
import { currentUserId } from '../../../platform/supabase';

export interface QueuedAnswer { key: string; attemptId: string; itemId: string; body: AnswerPut; queuedAt: number; ownerId?: string }

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

  constructor(store?: Store, private send = api.putAnswer, private owner: () => Promise<string | null | undefined> = async () => undefined) {
    this.store = store ?? idbStore() ?? memoryStore();
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.pending, this.lastError);
    return () => void this.listeners.delete(fn);
  }
  private emit() { for (const l of this.listeners) l(this.pending, this.lastError); }

  async enqueue(attemptId: string, itemId: string, body: AnswerPut) {
    const ownerId = await this.owner();
    if (ownerId === null) throw new Error('Sign in to save your answers.');
    const key = attemptId + '|' + itemId;
    try {
      await this.store.put({ key, attemptId, itemId, body, queuedAt: Date.now(), ownerId });
    } catch {
      // Storage can be unavailable (private mode); fall back to sending directly.
      this.store = memoryStore();
      await this.store.put({ key, attemptId, itemId, body, queuedAt: Date.now(), ownerId });
    }
    return this.flush();
  }

  async entries() {
    const ownerId = await this.owner();
    if (ownerId === null) return [];
    return (await this.store.all()).filter((e) => e.ownerId === ownerId);
  }

  async count() { return (await this.entries()).length; }

  flush(): Promise<void> {
    if (this.flushing) return this.flushing.then(() => this.flush());
    this.flushing = (async () => {
      const ownerId = await this.owner();
      const all = ownerId === null ? [] : (await this.store.all()).filter((e) => e.ownerId === ownerId).sort((a, b) => a.queuedAt - b.queuedAt);
      this.pending = all.length;
      this.emit();
      for (const e of all) {
        if (await this.owner() !== ownerId) break;
        try {
          await this.send(e.attemptId, e.itemId, e.body);
          const latest = (await this.store.all()).find((x) => x.key === e.key);
          if (latest && latest.queuedAt === e.queuedAt) await this.store.del(e.key);
          this.lastError = null;
        } catch (err) {
          if (err instanceof ApiError && err.status >= 400 && err.status < 500 && ![401, 408, 429].includes(err.status)) {
            await this.store.del(e.key); // final: locked, invalid or forbidden
            this.lastError = err.message;
          } else {
            this.lastError = err instanceof ApiError && err.status === 401 ? 'Sign in to sync your answers.' : 'offline';
            break; // keep order; retry later
          }
        }
      }
      this.pending = await this.count();
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

export const outbox = new AnswerOutbox(undefined, api.putAnswer, async () => isSupabase() ? await currentUserId() : undefined);
