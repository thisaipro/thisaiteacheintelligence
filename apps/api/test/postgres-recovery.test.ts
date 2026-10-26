import type pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PostgresRepo } from '../src/repo/postgres';
import { DatabaseUnavailableError } from '../src/db/errors';
import { createService } from '../src/service';
import { MemoryRepo } from '../src/repo/memory';

const client = () => ({ query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() });
afterEach(() => vi.restoreAllMocks());

describe('Postgres connection recovery', () => {
  it('reports a failed acquisition and can acquire a fresh connection on the next request', async () => {
    const c = client();
    const pool = { connect: vi.fn().mockRejectedValueOnce(new Error('Connection terminated due to connection timeout')).mockResolvedValue(c) };
    const repo = new PostgresRepo(pool as unknown as pg.Pool).forInstitution('school');
    await expect(repo.listCycles()).rejects.toBeInstanceOf(DatabaseUnavailableError);
    expect(c.query).not.toHaveBeenCalled();
    expect(await repo.listCycles()).toEqual([]);
    expect(c.release).toHaveBeenCalledWith(false);
  });

  it('discards disconnected clients and never replays a transaction after an uncertain commit', async () => {
    const failed = client();
    failed.query.mockImplementation(async (sql: string) => {
      if (sql === 'COMMIT' || sql === 'ROLLBACK') throw new Error('Connection terminated unexpectedly');
      return { rows: [] };
    });
    const fresh = client();
    const pool = { connect: vi.fn().mockResolvedValueOnce(failed).mockResolvedValue(fresh) };
    const repo = new PostgresRepo(pool as unknown as pg.Pool).forInstitution('school');
    await expect(repo.listCycles()).rejects.toBeInstanceOf(DatabaseUnavailableError);
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(failed.release).toHaveBeenCalledWith(true);
    expect(failed.query.mock.calls.filter(([sql]) => String(sql).startsWith('BEGIN'))).toHaveLength(1);
    expect(await repo.listCycles()).toEqual([]);
    expect(fresh.release).toHaveBeenCalledWith(false);
  });

  it('returns a retryable 503 without leaking connection details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const repo = new MemoryRepo({ items: [] });
    const scoped = repo.forInstitution('school');
    vi.spyOn(repo, 'forInstitution').mockReturnValue({ ...scoped, listCycles: async () => { throw new DatabaseUnavailableError(new Error('private connection details')); } });
    const response = await createService({ repo }).handle({ method: 'GET', path: '/access', me: { user_id: 'teacher', role: 'teacher', name: 'Teacher', institution_id: 'school' } });
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ error: 'database_unavailable' });
    expect(JSON.stringify(response.body)).not.toContain('private');
  });
});
