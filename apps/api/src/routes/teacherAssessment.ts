/* /api/teacher-assessment — every route re-checks access server-side. */
import { randomUUID } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  COHORT_MIN_N, DIMENSION_NAMES, GRADE_BAND_IDS,
  type AccessResponse, type AttemptDTO, type BankItem, type CohortDTO, type Me, type RosterRow,
} from '@thisai/ta-shared';
import { resolveAccess, type AccessDecision } from '../access';
import type { IdentityResolver } from '../auth/identity';
import { buildProfile, cohortAverages, isComplete, itemsForBand } from '../scoring/v1';
import { Presenter, itemLevelRows, profileRowFrom, toProfileDTO } from '../present';
import type { AttemptRow, InstitutionRepo, ItemRow, Repo } from '../repo/types';

export interface RouteConfig {
  repo: Repo;
  identity: IdentityResolver;
  now?: () => Date;
  moduleEnabled?: boolean;
  previewEnabled?: boolean;
  shuffleSalt?: string;
}

interface Ctx { me: Me; access: AccessDecision; repo: InstitutionRepo | null }
type Req = Request & { ta?: Ctx };

class HttpError extends Error {
  constructor(public status: number, public body: Record<string, unknown>) { super(String(body.error)); }
}

const AnswerBody = z.object({
  ranked: z.array(z.enum(['A', 'B', 'C', 'D']).nullable()).length(4),
  note: z.string().max(500).optional(),
  flagged: z.boolean().optional(),
  ms: z.number().int().min(0).max(24 * 3600 * 1000).optional(),
});
const StartBody = z.object({
  grade_band: z.string().refine((b) => GRADE_BAND_IDS.includes(b), 'unknown grade band'),
  restart: z.boolean().optional(),
});

export function teacherAssessmentRouter(cfg: RouteConfig): Router {
  const r = Router();
  const now = cfg.now ?? (() => new Date());
  const present = new Presenter(cfg.shuffleSalt ?? '');
  const previewEnabled = cfg.previewEnabled ?? true;

  const wrap = (fn: (req: Req, res: Response) => Promise<unknown>) => (req: Req, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

  /* Resolve identity + access once per request. */
  r.use((req: Req, _res, next) => {
    (async () => {
      const me = await cfg.identity(req);
      if (!me) throw new HttpError(401, { error: 'unauthenticated' });
      const repo = me.institution_id ? cfg.repo.forInstitution(me.institution_id) : null;
      const cycles = repo ? await repo.listCycles() : [];
      const hasProfile = !!(repo && me.role === 'teacher' && (await repo.latestSubmittedAttempt(me.user_id)));
      const access = resolveAccess(me, cycles, now(), { moduleEnabled: cfg.moduleEnabled ?? true, hasProfile });
      req.ta = { me, access, repo };
    })().then(() => next(), next);
  });

  const ctx = (req: Req) => req.ta!;
  const teacher = (req: Req) => {
    const c = ctx(req);
    if (!c.access.can_take) throw new HttpError(403, { error: 'forbidden', reason: c.access.reason ?? 'NOT_TEACHER' });
    return c as Ctx & { repo: InstitutionRepo };
  };
  /** Reading your own submitted profile survives a closed cycle. */
  const teacherReader = (req: Req) => {
    const c = ctx(req);
    if (c.access.can_take || (c.access.reason === 'CYCLE_CLOSED' && c.me.role === 'teacher')) return c as Ctx & { repo: InstitutionRepo };
    throw new HttpError(403, { error: 'forbidden', reason: c.access.reason ?? 'NOT_TEACHER' });
  };
  const admin = (req: Req) => {
    const c = ctx(req);
    if (!c.access.can_manage) throw new HttpError(403, { error: 'forbidden', reason: c.access.reason ?? 'NOT_ADMIN' });
    return c as Ctx & { repo: InstitutionRepo };
  };

  const itemsFor = async (a: AttemptRow) => cfg.repo.getItems(a.item_order);

  async function attemptDTO(repo: InstitutionRepo, a: AttemptRow): Promise<AttemptDTO> {
    const items = await itemsFor(a);
    const byId = new Map(items.map((i) => [i.item_id, i]));
    const answers = await repo.getAnswers(a.attempt_id);
    return {
      attempt_id: a.attempt_id, cycle_id: a.cycle_id, grade_band: a.grade_band, status: a.status,
      started_at: a.started_at.toISOString(), submitted_at: a.submitted_at?.toISOString() ?? null,
      items: items.map((i) => present.toClientItem(i)),
      answers: Object.fromEntries(answers.filter((x) => byId.has(x.item_id)).map((x) => [x.item_id, present.toAnswerDTO(byId.get(x.item_id)!, x)])),
    };
  }

  async function assemble(band: string): Promise<string[]> {
    const pool = await cfg.repo.listItems({ band, activeOnly: true });
    const order = itemsForBand(pool, band).map((i) => i.item_id);
    if (!order.length) throw new HttpError(409, { error: 'no_items', message: `No active items for ${band}` });
    return order;
  }

  async function score(repo: InstitutionRepo, a: AttemptRow) {
    const items = await itemsFor(a);
    const answers = await repo.getAnswers(a.attempt_id);
    const map = Object.fromEntries(answers.map((x) => [x.item_id, x]));
    return { items, answers, profile: buildProfile(items, map, a.grade_band, { displayOrder: present.displayOrder }) };
  }

  /* ── access ─────────────────────────────────────────────────── */
  r.get('/access', wrap(async (req, res) => {
    const { cycle: _cycle, ...body } = ctx(req).access;
    res.json(body satisfies AccessResponse);
  }));

  /* ── attempts ───────────────────────────────────────────────── */
  r.post('/attempts', wrap(async (req, res) => {
    const c = teacher(req);
    const body = StartBody.parse(req.body);
    const cycleId = c.access.cycle_id!;
    const existing = await c.repo.findAttempt(c.me.user_id, cycleId);
    if (existing?.status === 'submitted') throw new HttpError(409, { error: 'already_submitted', message: 'A retake opens in the next cycle.' });
    if (existing && existing.grade_band === body.grade_band && !body.restart) return res.json(await attemptDTO(c.repo, existing));
    const item_order = await assemble(body.grade_band);
    const a = existing
      ? await c.repo.resetAttempt(existing.attempt_id, { grade_band: body.grade_band, item_order, started_at: now() })
      : await c.repo.createAttempt({
          attempt_id: randomUUID(), teacher_id: c.me.user_id, institution_id: c.me.institution_id!, cycle_id: cycleId,
          grade_band: body.grade_band, started_at: now(), submitted_at: null, status: 'in_progress', item_order,
          teacher_name: c.me.name, department: c.me.department ?? null,
        });
    res.status(existing ? 200 : 201).json(await attemptDTO(c.repo, a));
  }));

  r.get('/attempts/current', wrap(async (req, res) => {
    const c = teacher(req);
    const a = await c.repo.findAttempt(c.me.user_id, c.access.cycle_id!);
    res.json(a ? await attemptDTO(c.repo, a) : null);
  }));

  async function ownAttempt(c: Ctx & { repo: InstitutionRepo }, id: string) {
    const a = await c.repo.getAttempt(id);
    if (!a || a.teacher_id !== c.me.user_id) throw new HttpError(404, { error: 'not_found' });
    return a;
  }

  r.put('/attempts/:id/answers/:itemId', wrap(async (req, res) => {
    const c = teacher(req);
    const a = await ownAttempt(c, req.params.id);
    if (a.status !== 'in_progress') throw new HttpError(409, { error: 'locked', message: 'Answers lock on submission.' });
    if (!a.item_order.includes(req.params.itemId)) throw new HttpError(404, { error: 'item_not_in_attempt' });
    const body = AnswerBody.parse(req.body);
    const [item] = await cfg.repo.getItems([req.params.itemId]);
    let ranked: (string | null)[];
    try {
      ranked = present.toBank(item as ItemRow, body.ranked);
    } catch (e) {
      throw new HttpError(400, { error: 'invalid_ranking', message: (e as Error).message });
    }
    const prev = (await c.repo.getAnswers(a.attempt_id)).find((x) => x.item_id === item.item_id);
    const row = await c.repo.upsertAnswer(a.attempt_id, item.item_id, {
      ranked, note: body.note ?? prev?.note ?? '', flagged: body.flagged ?? prev?.flagged ?? false, ms_on_item: body.ms ?? 0,
    }, now());
    res.json(present.toAnswerDTO(item, row));
  }));

  r.post('/attempts/:id/submit', wrap(async (req, res) => {
    const c = teacher(req);
    const a = await ownAttempt(c, req.params.id);
    if (a.status !== 'in_progress') throw new HttpError(409, { error: 'already_submitted' });
    const { items, answers, profile } = await score(c.repo, a);
    const missing = items.filter((i) => !isComplete(answers.find((x) => x.item_id === i.item_id)?.ranked)).map((i) => i.item_id);
    if (missing.length) throw new HttpError(422, { error: 'incomplete', missing });
    const at = now();
    const row = profileRowFrom(a.attempt_id, profile, at);
    if (!(await c.repo.submit(a.attempt_id, row, at))) throw new HttpError(409, { error: 'already_submitted' });
    const done = { ...a, status: 'submitted' as const, submitted_at: at };
    res.json(toProfileDTO({ attempt: done, institution_name: c.me.institution_name ?? null }, row, 'teacher',
      { items_answered: profile.items_answered, items_total: profile.items_total }));
  }));

  /* ── teacher reports ────────────────────────────────────────── */
  r.get('/profile/me', wrap(async (req, res) => {
    const c = teacherReader(req);
    const a = await c.repo.latestSubmittedAttempt(c.me.user_id);
    const p = a && (await c.repo.getProfile(a.attempt_id));
    if (!a || !p) throw new HttpError(404, { error: 'no_profile' });
    res.json(toProfileDTO({ attempt: a, institution_name: c.me.institution_name ?? null }, p, 'teacher',
      { items_answered: a.item_order.length, items_total: a.item_order.length }));
  }));

  r.get('/preview', wrap(async (req, res) => {
    const c = teacher(req);
    if (!previewEnabled) throw new HttpError(404, { error: 'preview_disabled' });
    const a = await c.repo.findAttempt(c.me.user_id, c.access.cycle_id!);
    if (!a || a.status !== 'in_progress') throw new HttpError(404, { error: 'no_attempt' });
    const { profile } = await score(c.repo, a);
    res.json(toProfileDTO({ attempt: a, institution_name: c.me.institution_name ?? null }, profile, 'teacher',
      { preview: true, items_answered: profile.items_answered, items_total: profile.items_total }));
  }));

  /* ── admin ──────────────────────────────────────────────────── */
  r.get('/admin/items', wrap(async (req, res) => {
    admin(req);
    const band = typeof req.query.band === 'string' && req.query.band !== 'All' ? req.query.band : undefined;
    const dimension = typeof req.query.dimension === 'string' && req.query.dimension !== 'All' ? req.query.dimension : undefined;
    if (band && !GRADE_BAND_IDS.includes(band)) throw new HttpError(400, { error: 'unknown_band' });
    if (dimension && !DIMENSION_NAMES.includes(dimension)) throw new HttpError(400, { error: 'unknown_dimension' });
    const items = await cfg.repo.listItems({ band, dimension });
    res.json(items.map((i): BankItem => ({
      item_id: i.item_id, grade_band: i.grade_band, dimension: i.dimension, gate_dimension: i.gate_dimension, scenario: i.scenario,
      options: i.options.map((o) => ({ ...o })), source_tag: i.source_tag, version: i.version, active: i.active,
    })));
  }));

  r.get('/admin/teachers', wrap(async (req, res) => {
    const c = admin(req);
    const attempts = await c.repo.listAttempts();
    const latest = new Map<string, AttemptRow>();
    for (const a of attempts) {
      const cur = latest.get(a.teacher_id);
      if (!cur || a.started_at > cur.started_at) latest.set(a.teacher_id, a);
    }
    const rows = [...latest.values()];
    const counts = await c.repo.answerCounts(rows.map((a) => a.attempt_id));
    const out: RosterRow[] = [];
    for (const a of rows) {
      const p = a.status === 'submitted' ? await c.repo.getProfile(a.attempt_id) : null;
      out.push({
        teacher_id: a.teacher_id, teacher_name: a.teacher_name, department: a.department, grade_band: a.grade_band,
        status: a.status, attempt_id: a.attempt_id, index: p?.index ?? null, index_band: p?.index_band ?? null,
        equity_gate: p ? p.equity_gate : null, validity_flag: p ? p.validity_flag : null,
        dim_bands: p ? Object.fromEntries(p.dims.map((d) => [d.dimension_id, d.band])) : {},
        items_answered: counts[a.attempt_id] ?? 0, submitted_at: a.submitted_at?.toISOString() ?? null,
        started_at: a.started_at.toISOString(),
      });
    }
    out.sort((x, y) => (y.submitted_at ?? y.started_at).localeCompare(x.submitted_at ?? x.started_at));
    res.json(out);
  }));

  r.get('/admin/teachers/:teacherId/profile', wrap(async (req, res) => {
    const c = admin(req);
    const a = await c.repo.latestSubmittedAttempt(req.params.teacherId);
    const p = a && (await c.repo.getProfile(a.attempt_id));
    if (!a || !p) throw new HttpError(404, { error: 'no_profile' });
    await c.repo.audit({ actor_id: c.me.user_id, action: 'view_teacher_profile', target_teacher_id: a.teacher_id, attempt_id: a.attempt_id }, now());
    const [items, answers] = await Promise.all([itemsFor(a), c.repo.getAnswers(a.attempt_id)]);
    res.json(toProfileDTO({ attempt: a, institution_name: c.me.institution_name ?? null }, p, 'admin', {
      items_answered: a.item_order.length, items_total: a.item_order.length, item_level: itemLevelRows(items, answers),
    }));
  }));

  r.get('/admin/cohort', wrap(async (req, res) => {
    const c = admin(req);
    const rows = await c.repo.listSubmittedProfiles();
    const latest = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const cur = latest.get(row.attempt.teacher_id);
      if (!cur || (row.attempt.submitted_at ?? 0) > (cur.attempt.submitted_at ?? 0)) latest.set(row.attempt.teacher_id, row);
    }
    const agg = cohortAverages([...latest.values()].map((x) => x.profile), COHORT_MIN_N);
    res.json({ n: agg.n, min_n: COHORT_MIN_N, available: agg.available, dims: agg.dims } satisfies CohortDTO);
  }));

  /* ── errors ─────────────────────────────────────────────────── */
  r.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json(err.body);
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'invalid_request', message: err.issues.map((i) => i.message).join('; ') });
    console.error('[teacher-assessment]', err);
    res.status(500).json({ error: 'internal' });
  });

  return r;
}
