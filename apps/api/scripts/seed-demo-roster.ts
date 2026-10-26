/** Add the original report fixtures to a shared demo database. Existing
 * attempts (including real submissions) are never overwritten. */
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readConfig } from '../src/env';
import { databaseConfig } from '../src/db/connection';
import { seedDemo } from '../src/dev/seed';
import { DEV_INSTITUTION } from '../src/auth/dev-institution';
import { Presenter } from '../src/present';
import { MemoryRepo } from '../src/repo/memory';
import { PostgresRepo } from '../src/repo/postgres';

export async function seedDemoRoster(pool: pg.Pool, institutionId: string, cycleId: string, salt: string) {
  const bank = await new PostgresRepo(pool).listItems({ activeOnly: true });
  const now = new Date();
  const memory = new MemoryRepo({ items: bank });
  await seedDemo(memory, now, new Presenter(salt));
  const fixtures = await memory.forInstitution(DEV_INSTITUTION.id).listSubmittedProfiles();
  const client = await pool.connect();
  try {
    await client.query(`BEGIN; SET LOCAL app.institution_id = ${pg.escapeLiteral(institutionId)}`);
    const cycle = (await client.query(
      'SELECT * FROM ta_cycles WHERE institution_id = $1 AND cycle_id = $2 FOR SHARE', [institutionId, cycleId],
    )).rows[0];
    if (!cycle) throw new Error('The target assessment cycle does not belong to this institution');
    const existing = (await client.query(
      `SELECT a.attempt_id, md5(row_to_json(a)::text || coalesce(row_to_json(p)::text, '')) AS fingerprint
       FROM ta_attempts a LEFT JOIN ta_profiles p ON p.attempt_id = a.attempt_id WHERE a.institution_id = $1`, [institutionId],
    )).rows;
    const candidates = fixtures.map(({ attempt, profile }, i) => {
      if (attempt.item_order.length !== 35) throw new Error('The bank must contain 35 active items per demo grade band');
      // Keep sample timestamps inside the actual target cycle.
      const end = Math.min(now.getTime(), new Date(cycle.closes_at).getTime() - 1000);
      const opens = new Date(cycle.opens_at).getTime();
      if (end <= opens) throw new Error('The target cycle has not opened yet');
      const submitted = new Date(Math.max(opens + 1, end - i * 60_000));
      const started = new Date(Math.max(opens, submitted.getTime() - 35 * 60_000));
      const id = randomUUID();
      const answers = [...memory.state.answers.get(attempt.attempt_id)!.values()].map((answer) => ({
        ...answer, attempt_id: id, updated_at: submitted.toISOString(),
      }));
      return {
        attempt: { ...attempt, attempt_id: id, institution_id: institutionId, cycle_id: cycleId,
          started_at: started.toISOString(), submitted_at: submitted.toISOString() },
        profile: { ...profile, attempt_id: id, created_at: submitted.toISOString() }, answers,
      };
    });
    const inserted = await client.query(`
      INSERT INTO ta_attempts (attempt_id, teacher_id, institution_id, cycle_id, grade_band,
        started_at, submitted_at, status, item_order, teacher_name, department)
      SELECT attempt_id, teacher_id, institution_id, cycle_id, grade_band,
        started_at, submitted_at, status, item_order, teacher_name, department
      FROM jsonb_to_recordset($1::jsonb) AS x(attempt_id text, teacher_id text, institution_id text,
        cycle_id text, grade_band text, started_at timestamptz, submitted_at timestamptz,
        status text, item_order jsonb, teacher_name text, department text)
      ON CONFLICT (teacher_id, cycle_id) DO NOTHING RETURNING attempt_id`,
    [JSON.stringify(candidates.map((row) => row.attempt))]);
    const ids = new Set(inserted.rows.map((row) => row.attempt_id));
    const added = candidates.filter((row) => ids.has(row.attempt.attempt_id));
    if (added.length) {
      await client.query(`
        INSERT INTO ta_answers (attempt_id, item_id, ranked, note, flagged, updated_at, ms_on_item)
        SELECT attempt_id, item_id, ranked, note, flagged, updated_at, ms_on_item
        FROM jsonb_to_recordset($1::jsonb) AS x(attempt_id text, item_id text, ranked text[],
          note text, flagged boolean, updated_at timestamptz, ms_on_item integer)`,
      [JSON.stringify(added.flatMap((row) => row.answers))]);
      await client.query(`
        INSERT INTO ta_profiles (attempt_id, "index", index_band, dims, equity_gate, validity_flag,
          validity_reasons, insights, path, strengths, growth, scoring_version, created_at)
        SELECT attempt_id, "index", index_band, dims, equity_gate, validity_flag,
          validity_reasons, insights, path, strengths, growth, scoring_version, created_at
        FROM jsonb_to_recordset($1::jsonb) AS x(attempt_id text, "index" integer, index_band text,
          dims jsonb, equity_gate boolean, validity_flag boolean, validity_reasons jsonb,
          insights jsonb, path jsonb, strengths jsonb, growth jsonb, scoring_version text, created_at timestamptz)`,
      [JSON.stringify(added.map((row) => row.profile))]);
    }
    const preserved = (await client.query(
      `SELECT a.attempt_id, md5(row_to_json(a)::text || coalesce(row_to_json(p)::text, '')) AS fingerprint
       FROM ta_attempts a LEFT JOIN ta_profiles p ON p.attempt_id = a.attempt_id WHERE a.attempt_id = ANY($1::text[])`,
      [existing.map((row) => row.attempt_id)],
    )).rows;
    if (preserved.length !== existing.length || existing.some((row) => !preserved.some((other) => other.attempt_id === row.attempt_id && other.fingerprint === row.fingerprint))) {
      throw new Error('Existing assessment verification failed');
    }
    const verification = (await client.query(
      `SELECT count(DISTINCT a.teacher_id)::int AS teachers, count(DISTINCT p.attempt_id)::int AS reports
       FROM ta_attempts a LEFT JOIN ta_profiles p ON p.attempt_id = a.attempt_id
       WHERE a.institution_id = $1`, [institutionId],
    )).rows[0];
    await client.query('COMMIT');
    return { added: added.length, skipped: fixtures.length - added.length, preserved: existing.length, ...verification };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const cfg = readConfig();
  if (!cfg.databaseUrl) throw new Error('A database connection is required');
  const pool = new pg.Pool({ ...databaseConfig(cfg.databaseUrl), max: 1, connectionTimeoutMillis: 30_000 });
  seedDemoRoster(pool, process.argv[2] || 'demo-school', process.argv[3] || 'demo-cycle-1', cfg.shuffleSalt)
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => { console.error('Demo roster seed failed:', error.code || error.name); process.exitCode = 1; })
    .finally(() => pool.end());
}
