import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { AnswerOutbox } from '../api/outbox';

const mem = () => {
  const m = new Map<string, any>();
  return { put: async (e: any) => void m.set(e.key, e), del: async (k: string) => void m.delete(k), all: async () => [...m.values()] };
};

describe('AnswerOutbox', () => {
  it('keeps answers queued while offline and syncs on reconnect', async () => {
    let online = false;
    const send = vi.fn(async () => { if (!online) throw new TypeError('Failed to fetch'); return {} as any; });
    const ob = new AnswerOutbox(mem(), send);
    const seen: [number, string | null][] = [];
    ob.subscribe((n, e) => seen.push([n, e]));
    await ob.enqueue('att', 'I1', { ranked: ['A', null, null, null] });
    await ob.enqueue('att', 'I1', { ranked: ['A', 'B', null, null] }); // coalesced: newest wins
    await ob.enqueue('att', 'I2', { ranked: ['C', null, null, null] });
    expect(await ob.count()).toBe(2);
    expect(seen.at(-1)).toEqual([2, 'offline']);
    online = true;
    await ob.flush();
    expect(await ob.count()).toBe(0);
    expect(send).toHaveBeenLastCalledWith('att', 'I2', { ranked: ['C', null, null, null] });
    expect(send).toHaveBeenCalledWith('att', 'I1', { ranked: ['A', 'B', null, null] });
    expect(seen.at(-1)).toEqual([0, null]);
  });

  it('drops a PUT the server rejects for good (e.g. locked after submit)', async () => {
    const send = vi.fn(async () => { throw new ApiError(409, { error: 'locked', message: 'Answers lock on submission.' }); });
    const ob = new AnswerOutbox(mem(), send);
    await ob.enqueue('att', 'I1', { ranked: ['A', 'B', 'C', 'D'] });
    expect(await ob.count()).toBe(0);
  });

  it('persists in IndexedDB by default', async () => {
    const send = vi.fn(async () => { throw new TypeError('offline'); });
    await new AnswerOutbox(undefined, send).enqueue('att', 'I9', { ranked: ['D', null, null, null] });
    const again = new AnswerOutbox(undefined, vi.fn(async () => ({}) as any));
    expect(await again.count()).toBe(1);
    await again.flush();
    expect(await again.count()).toBe(0);
  });
});
