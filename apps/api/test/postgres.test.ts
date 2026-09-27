/* Runs only when TA_TEST_DATABASE_URL (owner, for migrations) and
   TA_TEST_APP_DATABASE_URL (non-owner app role, so RLS applies) are set. */
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AttemptDTO } from '@thisai/ta-shared';
import { createApp } from '../src/app';
import { devIdentity } from '../src/auth/identity';
import { migrate, seedItems } from '../src/db/migrate';
import { PostgresRepo } from '../src/repo/postgres';

const OWNER = process.env.TA_TEST_DATABASE_URL;
const APP = process.env.TA_TEST_APP_DATABASE_URL;
const NOW = new Date('2026-09-27T10:00:00Z');

describe.skipIf(!OWNER || !APP)('Postgres repository + migrations', () => {
  let owner: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    owner = new pg.Pool({ connectionString: OWNER });
    await owner.query('DROP TABLE IF EXISTS ta_audit_log, ta_profiles, ta_answers, ta_attempts, ta_cycles, ta_options, ta_items, ta_schema_migrations CASCADE');
    expect(await migrate(owner)).toEqual(['001_teacher_assessment.sql']);
    expect(await migrate(owner)).toEqual([]);
    expect(await seedItems(owner)).toBe(210);
    const appRole = new URL(APP!).username;
    await owner.query(`GRANT SELECT ON ta_items, ta_options TO ${appRole}`);
    await owner.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ta_cycles, ta_attempts, ta_answers, ta_profiles TO ${appRole}`);
    await owner.query(`GRANT SELECT, INSERT ON ta_audit_log TO ${appRole}`);
    await owner.query(`GRANT USAGE ON SEQUENCE ta_audit_log_id_seq TO ${appRole}`);
    await owner.query(
      `INSERT INTO ta_cycles VALUES ('cyc-stp-2','inst-stpeters','Cycle 2',$1,$2,true), ('cyc-lkv-1','inst-lakeview','Cycle 1',$3,$1,true)`,
      [new Date(NOW.getTime() - 86400000), new Date(NOW.getTime() + 86400000), new Date(NOW.getTime() - 9e9)]);
    appPool = new pg.Pool({ connectionString: APP });
  });
  afterAll(async () => { await appPool?.end(); await owner?.end(); });

  it('runs the teacher journey and admin views on Postgres', async () => {
    const app = createApp({ repo: new PostgresRepo(appPool), identity: devIdentity(), now: () => NOW });
    const t = (m: 'get' | 'post' | 'put', u: string, user = 't') => request(app)[m]('/api/teacher-assessment' + u).set('x-ta-dev-user', user);

    const a: AttemptDTO = (await t('post', '/attempts').send({ grade_band: 'High School (9-10)' })).body;
    expect(a.items).toHaveLength(35);
    expect(JSON.stringify(a)).not.toMatch(/key_rank/);
    for (const [n, it] of a.items.entries())
      expect((await t('put', `/attempts/${a.attempt_id}/answers/${it.item_id}`).send({ ranked: n % 3 ? ['B', 'A', 'C', 'D'] : ['C', 'A', 'D', 'B'], ms: 21000 })).status).toBe(200);
    const partial = await t('put', `/attempts/${a.attempt_id}/answers/${a.items[0].item_id}`).send({ ranked: ['C', 'A', 'D', 'B'], flagged: true, ms: 1 });
    expect(partial.body).toMatchObject({ flagged: true, ms_on_item: 21000 });
    const sub = await t('post', `/attempts/${a.attempt_id}/submit`);
    expect(sub.status).toBe(200);
    expect(sub.body.scoring_version).toBe('v1');
    expect((await t('get', '/profile/me')).body.index).toBe(sub.body.index);

    const roster = (await t('get', '/admin/teachers', 'a')).body;
    expect(roster).toEqual([expect.objectContaining({ teacher_id: 'TCH-0412', status: 'submitted', items_answered: 35, index: sub.body.index })]);
    const prof = (await t('get', '/admin/teachers/TCH-0412/profile', 'a')).body;
    expect(prof.item_level).toHaveLength(35);
    expect((await t('get', '/admin/cohort', 'a')).body).toMatchObject({ n: 1, available: false, dims: null });
    expect((await owner.query('SELECT action FROM ta_audit_log')).rows).toEqual([{ action: 'view_teacher_profile' }]);
  });

  it('row-level security hides other institutions even without a WHERE clause', async () => {
    const c = await appPool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.institution_id', 'inst-lakeview', true)`);
      expect((await c.query('SELECT count(*)::int AS n FROM ta_attempts')).rows[0].n).toBe(0);
      expect((await c.query('SELECT count(*)::int AS n FROM ta_answers')).rows[0].n).toBe(0);
      expect((await c.query('SELECT count(*)::int AS n FROM ta_profiles')).rows[0].n).toBe(0);
      expect((await c.query('SELECT count(*)::int AS n FROM ta_cycles')).rows[0].n).toBe(1);
      await c.query('ROLLBACK');
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.institution_id', 'inst-stpeters', true)`);
      expect((await c.query('SELECT count(*)::int AS n FROM ta_answers')).rows[0].n).toBe(35);
      await c.query('ROLLBACK');
    } finally {
      c.release();
    }
  });
});
