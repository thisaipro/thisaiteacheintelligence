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
    expect(await migrate(owner)).toEqual(['001_teacher_assessment.sql', '002_supabase_api_only.sql']);
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
    const initial = await t('get', '/bootstrap');
    expect(initial.status).toBe(200);
    expect(initial.body).toMatchObject({ me: { user_id: 'TCH-0412' }, access: { can_take: true }, attempt: { attempt_id: a.attempt_id }, profile: null });
    expect(initial.body.attempt.items).toHaveLength(35);
    expect(JSON.stringify(initial.body)).not.toMatch(/key_rank|rationale|item_level/);
    for (const [n, it] of a.items.entries()) {
      const response = await t('put', `/attempts/${a.attempt_id}/answers/${it.item_id}`).send({ ranked: n % 3 ? ['B', 'A', 'C', 'D'] : ['C', 'A', 'D', 'B'], ms: 21000 });
      expect(response.status, `${it.item_id}: ${JSON.stringify(response.body)}`).toBe(200);
    }
    const partial = await t('put', `/attempts/${a.attempt_id}/answers/${a.items[0].item_id}`).send({ ranked: ['C', 'A', 'D', 'B'], flagged: true, ms: 1 });
    expect(partial.body).toMatchObject({ flagged: true, ms_on_item: 21000 });
    const draft = await t('get', '/bootstrap');
    expect(draft.body.preview.preview).toBe(true);
    expect(draft.body.preview.dims.every((dimension: any) => dimension.coaching_note === null)).toBe(true);
    expect(draft.body.profile).toBeNull();
    const sub = await t('post', `/attempts/${a.attempt_id}/submit`);
    expect(sub.status).toBe(200);
    expect(sub.body.scoring_version).toBe('v1');
    expect((await t('get', '/profile/me')).body.index).toBe(sub.body.index);
    const completed = await t('get', '/bootstrap');
    expect(completed.body.profile.index).toBe(sub.body.index);
    expect(completed.body.access.has_profile).toBe(true);
    expect(completed.body.attempt.status).toBe('submitted');
    expect(completed.body.preview).toBeNull();
    const other = await t('get', '/bootstrap', 'c');
    expect(other.body.attempt).toBeNull();
    expect(other.body.profile).toBeNull();
    const admin = await t('get', '/bootstrap', 'a');
    expect(admin.body.access.can_manage).toBe(true);
    expect(admin.body.attempt).toBeNull();
    expect(admin.body.profile).toBeNull();

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

  it('blocks Supabase browser roles from reading keys or accessing assessment tables', async () => {
    const roles = (await owner.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')")).rows;
    for (const { rolname } of roles) {
      for (const table of ['ta_items', 'ta_options', 'ta_answers', 'ta_profiles', 'ta_attempts', 'ta_cycles', 'ta_audit_log', 'ta_schema_migrations']) {
        const result = await owner.query('SELECT has_table_privilege($1, $2, $3) AS allowed', [rolname, table, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE']);
        expect(result.rows[0].allowed, `${rolname} ${table}`).toBe(false);
      }
    }
  });

  it('escapes snapshot identifiers and resets the institution after the batched transaction', async () => {
    const repo = new PostgresRepo(appPool);
    const injection = await repo.forInstitution("inst-stpeters'; SELECT 1; --").loadTeacherState('TCH-0412', NOW);
    expect(injection.cycles).toEqual([]);
    expect(injection.attempt).toBeNull();
    const wrongTeacher = await repo.forInstitution('inst-stpeters').loadTeacherState("teacher' OR true --", NOW);
    expect(wrongTeacher.attempt).toBeNull();
    expect(wrongTeacher.profile).toBeNull();
    const leaked = await appPool.query('SELECT count(*)::int AS n FROM ta_attempts');
    expect(leaked.rows[0].n).toBe(0);
  });
});
