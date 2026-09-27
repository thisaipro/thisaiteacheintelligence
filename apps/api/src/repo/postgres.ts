/* Postgres repository. Every institution-scoped call runs in a transaction
   with `SET LOCAL app.institution_id`, so RLS policies (migration 001) filter
   rows even if a WHERE clause is ever forgotten. Queries still carry their own
   institution guard as a second line of defence. */
import pg from 'pg';
import type { Cycle } from '../access';
import type { AnswerRow, AttemptRow, InstitutionRepo, ItemRow, ProfileRow, Repo } from './types';

type Q = pg.PoolClient;

const attemptFrom = (r: any): AttemptRow => ({
  attempt_id: r.attempt_id, teacher_id: r.teacher_id, institution_id: r.institution_id, cycle_id: r.cycle_id,
  grade_band: r.grade_band, started_at: new Date(r.started_at), submitted_at: r.submitted_at ? new Date(r.submitted_at) : null,
  status: r.status, item_order: r.item_order, teacher_name: r.teacher_name, department: r.department,
});
const answerFrom = (r: any): AnswerRow => ({
  item_id: r.item_id, ranked: r.ranked, note: r.note, flagged: r.flagged, updated_at: new Date(r.updated_at), ms_on_item: r.ms_on_item,
});
const profileFrom = (r: any): ProfileRow => ({
  attempt_id: r.attempt_id, index: r.index, index_band: r.index_band, dims: r.dims, equity_gate: r.equity_gate,
  validity_flag: r.validity_flag, validity_reasons: r.validity_reasons, insights: r.insights, path: r.path,
  strengths: r.strengths, growth: r.growth, scoring_version: r.scoring_version, created_at: new Date(r.created_at),
});
const cycleFrom = (r: any): Cycle => ({
  cycle_id: r.cycle_id, institution_id: r.institution_id, name: r.name,
  opens_at: new Date(r.opens_at), closes_at: new Date(r.closes_at), enabled: r.enabled,
});

export class PostgresRepo implements Repo {
  constructor(private pool: pg.Pool) {}

  private async itemsWhere(where: string, params: unknown[]): Promise<ItemRow[]> {
    const { rows } = await this.pool.query(
      `SELECT i.*, coalesce(json_agg(json_build_object('label', o.label, 'text', o.text, 'key_rank', o.key_rank,
                'points', o.points, 'rationale', o.rationale) ORDER BY o.label) FILTER (WHERE o.item_id IS NOT NULL), '[]') AS options
         FROM ta_items i LEFT JOIN ta_options o ON o.item_id = i.item_id
        ${where} GROUP BY i.item_id ORDER BY i.item_id`, params);
    return rows.map((r) => ({
      item_id: r.item_id, grade_band: r.grade_band, dimension: r.dimension, gate_dimension: r.gate, scenario: r.scenario,
      source_tag: r.source_tag, version: r.version, active: r.active,
      options: r.options.map((o: any) => ({ ...o, label: String(o.label).trim() })),
    }));
  }

  listItems(filter: { band?: string; dimension?: string; activeOnly?: boolean } = {}) {
    const cond: string[] = [];
    const params: unknown[] = [];
    if (filter.band) { params.push(filter.band); cond.push(`i.grade_band = $${params.length}`); }
    if (filter.dimension) { params.push(filter.dimension); cond.push(`i.dimension = $${params.length}`); }
    if (filter.activeOnly) cond.push('i.active');
    return this.itemsWhere(cond.length ? 'WHERE ' + cond.join(' AND ') : '', params);
  }

  async getItems(ids: string[]) {
    const rows = await this.itemsWhere('WHERE i.item_id = ANY($1)', [ids]);
    const by = new Map(rows.map((r) => [r.item_id, r]));
    return ids.map((id) => by.get(id)).filter((r): r is ItemRow => !!r);
  }

  forInstitution(inst: string): InstitutionRepo {
    const tx = async <T>(fn: (c: Q) => Promise<T>): Promise<T> => {
      const c = await this.pool.connect();
      try {
        await c.query('BEGIN');
        await c.query(`SELECT set_config('app.institution_id', $1, true)`, [inst]);
        const out = await fn(c);
        await c.query('COMMIT');
        return out;
      } catch (e) {
        await c.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    };
    const one = async <T>(c: Q, sql: string, p: unknown[], map: (r: any) => T) => {
      const { rows } = await c.query(sql, p);
      return rows[0] ? map(rows[0]) : null;
    };

    return {
      listCycles: () => tx(async (c) => (await c.query('SELECT * FROM ta_cycles WHERE institution_id = $1', [inst])).rows.map(cycleFrom)),
      findAttempt: (teacherId, cycleId) => tx((c) => one(c,
        'SELECT * FROM ta_attempts WHERE institution_id = $1 AND teacher_id = $2 AND cycle_id = $3', [inst, teacherId, cycleId], attemptFrom)),
      getAttempt: (id) => tx((c) => one(c, 'SELECT * FROM ta_attempts WHERE institution_id = $1 AND attempt_id = $2', [inst, id], attemptFrom)),
      createAttempt: (a) => tx(async (c) => {
        if (a.institution_id !== inst) throw new Error('institution mismatch');
        return (await one(c,
          `INSERT INTO ta_attempts (attempt_id, teacher_id, institution_id, cycle_id, grade_band, started_at, status, item_order, teacher_name, department)
           VALUES ($1,$2,$3,$4,$5,$6,'in_progress',$7,$8,$9) RETURNING *`,
          [a.attempt_id, a.teacher_id, inst, a.cycle_id, a.grade_band, a.started_at, JSON.stringify(a.item_order), a.teacher_name, a.department],
          attemptFrom))!;
      }),
      resetAttempt: (id, p) => tx(async (c) => {
        await c.query('DELETE FROM ta_answers WHERE attempt_id = $1', [id]);
        return (await one(c,
          `UPDATE ta_attempts SET grade_band = $3, item_order = $4, started_at = $5
            WHERE institution_id = $1 AND attempt_id = $2 AND status = 'in_progress' RETURNING *`,
          [inst, id, p.grade_band, JSON.stringify(p.item_order), p.started_at], attemptFrom))!;
      }),
      getAnswers: (id) => tx(async (c) => (await c.query(
        `SELECT ans.* FROM ta_answers ans JOIN ta_attempts a ON a.attempt_id = ans.attempt_id
          WHERE a.institution_id = $1 AND ans.attempt_id = $2`, [inst, id])).rows.map(answerFrom)),
      upsertAnswer: (id, itemId, a, at) => tx(async (c) => {
        const ok = await c.query(`SELECT 1 FROM ta_attempts WHERE institution_id = $1 AND attempt_id = $2 AND status = 'in_progress' FOR UPDATE`, [inst, id]);
        if (!ok.rowCount) throw new Error('attempt not writable');
        return (await one(c,
          `INSERT INTO ta_answers (attempt_id, item_id, ranked, note, flagged, ms_on_item, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (attempt_id, item_id) DO UPDATE SET ranked = EXCLUDED.ranked, note = EXCLUDED.note,
             flagged = EXCLUDED.flagged, ms_on_item = GREATEST(ta_answers.ms_on_item, EXCLUDED.ms_on_item), updated_at = EXCLUDED.updated_at
           RETURNING *`, [id, itemId, a.ranked, a.note, a.flagged, a.ms_on_item, at], answerFrom))!;
      }),
      submit: (id, p, at) => tx(async (c) => {
        const upd = await c.query(
          `UPDATE ta_attempts SET status = 'submitted', submitted_at = $3
            WHERE institution_id = $1 AND attempt_id = $2 AND status = 'in_progress'`, [inst, id, at]);
        if (!upd.rowCount) return false;
        await c.query(
          `INSERT INTO ta_profiles (attempt_id, index, index_band, dims, equity_gate, validity_flag, validity_reasons,
                                    insights, path, strengths, growth, scoring_version, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [id, p.index, p.index_band, JSON.stringify(p.dims), p.equity_gate, p.validity_flag, JSON.stringify(p.validity_reasons),
            JSON.stringify(p.insights), JSON.stringify(p.path), JSON.stringify(p.strengths), JSON.stringify(p.growth), p.scoring_version, p.created_at]);
        return true;
      }),
      getProfile: (id) => tx((c) => one(c,
        `SELECT p.* FROM ta_profiles p JOIN ta_attempts a ON a.attempt_id = p.attempt_id
          WHERE a.institution_id = $1 AND p.attempt_id = $2`, [inst, id], profileFrom)),
      latestSubmittedAttempt: (teacherId) => tx((c) => one(c,
        `SELECT * FROM ta_attempts WHERE institution_id = $1 AND teacher_id = $2 AND status = 'submitted'
          ORDER BY submitted_at DESC LIMIT 1`, [inst, teacherId], attemptFrom)),
      listAttempts: () => tx(async (c) => (await c.query('SELECT * FROM ta_attempts WHERE institution_id = $1', [inst])).rows.map(attemptFrom)),
      listSubmittedProfiles: () => tx(async (c) => (await c.query(
        `SELECT row_to_json(a.*) AS a, row_to_json(p.*) AS p FROM ta_attempts a JOIN ta_profiles p ON p.attempt_id = a.attempt_id
          WHERE a.institution_id = $1 AND a.status = 'submitted'`, [inst])).rows.map((r) => ({ attempt: attemptFrom(r.a), profile: profileFrom(r.p) }))),
      answerCounts: (ids) => tx(async (c) => {
        const { rows } = await c.query(
          `SELECT ans.attempt_id, count(*) FILTER (WHERE array_position(ans.ranked, NULL) IS NULL)::int AS n
             FROM ta_answers ans JOIN ta_attempts a ON a.attempt_id = ans.attempt_id
            WHERE a.institution_id = $1 AND ans.attempt_id = ANY($2) GROUP BY ans.attempt_id`, [inst, ids]);
        return Object.fromEntries(rows.map((r) => [r.attempt_id, r.n]));
      }),
      audit: (e, at) => tx(async (c) => {
        await c.query(
          `INSERT INTO ta_audit_log (actor_id, institution_id, action, target_teacher_id, attempt_id, at) VALUES ($1,$2,$3,$4,$5,$6)`,
          [e.actor_id, inst, e.action, e.target_teacher_id ?? null, e.attempt_id ?? null, at]);
      }),
    };
  }
}
