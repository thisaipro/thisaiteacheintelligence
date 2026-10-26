import type pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PostgresRepo } from '../src/repo/postgres';
import { loadBank } from '../src/bank';
import { MemoryRepo } from '../src/repo/memory';
import { seedDemo } from '../src/dev/seed';
import { createService } from '../src/service';
import { DEV_USERS } from '../src/auth/identity';

afterEach(() => vi.restoreAllMocks());

describe('page load query budget', () => {
  it('fetches all institution/user state in one database exchange', async () => {
    const c = { query: vi.fn().mockResolvedValue([{}, {}, { rows: [{ cycles: [], attempt: null, answers: [], latest_attempt: null, profile: null }] }, {}]), release: vi.fn() };
    const pool = { connect: vi.fn().mockResolvedValue(c) };
    const result = await new PostgresRepo(pool as unknown as pg.Pool).forInstitution('school').loadTeacherState('teacher', new Date());
    expect(result).toEqual({ cycles: [], attempt: null, answers: [], latestAttempt: null, profile: null });
    expect(c.query).toHaveBeenCalledTimes(1);
    expect(c.query.mock.calls[0][0]).toContain('BEGIN READ ONLY');
    expect(c.query.mock.calls[0][0]).toContain('COMMIT');
    expect(c.release).toHaveBeenCalledWith(false);
  });

  it('deduplicates concurrent bank reads and refreshes after 60 seconds', async () => {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const bank = loadBank();
    const query = vi.fn().mockResolvedValue({ rows: bank.map((item) => ({ ...item, gate: item.gate_dimension })) });
    const repo = new PostgresRepo({ query } as unknown as pg.Pool);
    const id = bank[0].item_id;
    const [first] = await Promise.all([repo.getItems([id]), repo.getItems([id])]);
    expect(query).toHaveBeenCalledTimes(1);
    first[0].scenario = 'Changed copy';
    expect((await repo.getItems([id]))[0].scenario).toBe(bank[0].scenario);
    expect(query).toHaveBeenCalledTimes(1);
    now += 60_001;
    await repo.getItems([id]);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('does not retain a failed bank load', async () => {
    const query = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ rows: [] });
    const repo = new PostgresRepo({ query } as unknown as pg.Pool);
    await expect(repo.getItems(['I1'])).rejects.toThrow('offline');
    expect(await repo.getItems(['I1'])).toEqual([]);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('returns only permitted teacher data and redacts answer keys from bootstrap', async () => {
    const repo = new MemoryRepo({ items: loadBank() });
    await seedDemo(repo, new Date());
    const service = createService({ repo });
    const teacher = { ...DEV_USERS.t, user_id: 'TCH-0318' };
    const result = await service.handle({ method: 'GET', path: '/bootstrap', me: teacher });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ access: { can_take: true, has_profile: true }, profile: { teacher_id: 'TCH-0318' } });
    expect(JSON.stringify(result.body)).not.toMatch(/key_rank|rationale|item_level/);
    const denied = await service.handle({ method: 'GET', path: '/bootstrap', me: { ...teacher, role: 'student' } });
    expect(denied.body).toMatchObject({ access: { can_take: false }, attempt: null, profile: null, preview: null });
    expect((await service.handle({ method: 'GET', path: '/bootstrap', me: null })).status).toBe(401);
  });
});
