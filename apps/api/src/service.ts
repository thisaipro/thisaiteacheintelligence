/* Teacher Assessment service — every endpoint of /api/teacher-assessment as a
   framework-agnostic handler. Express wraps it on the server (routes/); the MVP
   build runs the same handler in the browser. No Node-only imports here. */
import { z } from 'zod';
import {
  COHORT_MIN_N, DIMENSION_NAMES, GRADE_BAND_IDS,
  type AccessResponse, type AttemptDTO, type BankItem, type CohortDTO, type Me, type RosterRow,
} from '@thisai/ta-shared';
import { resolveAccess, type AccessDecision, type Cycle } from './access';
import { buildProfile, cohortAverages, isComplete, itemsForBand } from './scoring/v1';
import { Presenter, itemLevelRows, profileRowFrom, toProfileDTO } from './present';
import type { AttemptRow, InstitutionRepo, ItemRow, Repo } from './repo/types';

export interface ServiceConfig {
  repo: Repo;
  now?: () => Date;
  moduleEnabled?: boolean;
  previewEnabled?: boolean;
  shuffleSalt?: string;
  /** Replaces resolveAccess (MVP: no auth, one user who can take and manage). */
  accessOverride?: (me: Me, cycles: Cycle[], now: Date) => AccessDecision;
}

export interface ServiceRequest {
  method: string;
  /** Path below /api/teacher-assessment, e.g. "/attempts/current". */
  path: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
  me: Me | null;
}
export interface ServiceResponse { status: number; body: unknown }

export class HttpError extends Error {
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

interface Ctx { me: Me; access: AccessDecision; repo: InstitutionRepo | null }
type Scoped = Ctx & { repo: InstitutionRepo };
type Handler = (c: Ctx, p: Record<string, string>, req: ServiceRequest) => Promise<ServiceResponse | unknown>;

const uuid = () => globalThis.crypto.randomUUID();

export function createService(cfg: ServiceConfig) {
  const now = cfg.now ?? (() => new Date());
  const present = new Presenter(cfg.shuffleSalt ?? '');
  const previewEnabled = cfg.previewEnabled ?? true;

  const teacher = (c: Ctx): Scoped => {
    if (!c.access.can_take) throw new HttpError(403, { error: 'forbidden', reason: c.access.reason ?? 'NOT_TEACHER' });
    return c as Scoped;
  };
  /** Reading your own submitted profile survives a closed cycle. */
  const teacherReader = (c: Ctx): Scoped => {
    if (c.access.can_take || (c.access.reason === 'CYCLE_CLOSED' && c.me.role === 'teacher')) return c as Scoped;
    throw new HttpError(403, { error: 'forbidden', reason: c.access.reason ?? 'NOT_TEACHER' });
  };
  const admin = (c: Ctx): Scoped => {
    if (!c.access.can_manage) throw new HttpError(403, { error: 'forbidden', reason: c.access.reason ?? 'NOT_ADMIN' });
    return c as Scoped;
  };

  const itemsFor = (a: AttemptRow) => cfg.repo.getItems(a.item_order);

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

  async function ownAttempt(c: Scoped, id: string) {
    const a = await c.repo.getAttempt(id);
    if (!a || a.teacher_id !== c.me.user_id) throw new HttpError(404, { error: 'not_found' });
    return a;
  }

  const routes: [string, RegExp, Handler][] = [];
  const route = (method: string, pattern: string, h: Handler) =>
    routes.push([method, new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '/?$'), h]);

  /* ── access ─────────────────────────────────────────────────── */
  route('GET', '/access', async (c) => {
    const { cycle: _cycle, ...body } = c.access;
    return body satisfies AccessResponse;
  });

  /* ── attempts ───────────────────────────────────────────────── */
  route('POST', '/attempts', async (ctx, _p, req) => {
    const c = teacher(ctx);
    const body = StartBody.parse(req.body);
    const cycleId = c.access.cycle_id!;
    const existing = await c.repo.findAttempt(c.me.user_id, cycleId);
    if (existing?.status === 'submitted') throw new HttpError(409, { error: 'already_submitted', message: 'A retake opens in the next cycle.' });
    if (existing && existing.grade_band === body.grade_band && !body.restart) return attemptDTO(c.repo, existing);
    const item_order = await assemble(body.grade_band);
    const a = existing
      ? await c.repo.resetAttempt(existing.attempt_id, { grade_band: body.grade_band, item_order, started_at: now() })
      : await c.repo.createAttempt({
          attempt_id: uuid(), teacher_id: c.me.user_id, institution_id: c.me.institution_id!, cycle_id: cycleId,
          grade_band: body.grade_band, started_at: now(), submitted_at: null, status: 'in_progress', item_order,
          teacher_name: c.me.name, department: c.me.department ?? null,
        });
    return { status: existing ? 200 : 201, body: await attemptDTO(c.repo, a) } satisfies ServiceResponse;
  });

  route('GET', '/attempts/current', async (ctx) => {
    const c = teacher(ctx);
    const a = await c.repo.findAttempt(c.me.user_id, c.access.cycle_id!);
    return a ? attemptDTO(c.repo, a) : null;
  });

  route('PUT', '/attempts/:id/answers/:itemId', async (ctx, p, req) => {
    const c = teacher(ctx);
    const a = await ownAttempt(c, p.id);
    if (a.status !== 'in_progress') throw new HttpError(409, { error: 'locked', message: 'Answers lock on submission.' });
    if (!a.item_order.includes(p.itemId)) throw new HttpError(404, { error: 'item_not_in_attempt' });
    const body = AnswerBody.parse(req.body);
    const [item] = await cfg.repo.getItems([p.itemId]);
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
    return present.toAnswerDTO(item, row);
  });

  route('POST', '/attempts/:id/submit', async (ctx, p) => {
    const c = teacher(ctx);
    const a = await ownAttempt(c, p.id);
    if (a.status !== 'in_progress') throw new HttpError(409, { error: 'already_submitted' });
    const { items, answers, profile } = await score(c.repo, a);
    const missing = items.filter((i) => !isComplete(answers.find((x) => x.item_id === i.item_id)?.ranked)).map((i) => i.item_id);
    if (missing.length) throw new HttpError(422, { error: 'incomplete', missing });
    const at = now();
    const row = profileRowFrom(a.attempt_id, profile, at);
    if (!(await c.repo.submit(a.attempt_id, row, at))) throw new HttpError(409, { error: 'already_submitted' });
    const done = { ...a, status: 'submitted' as const, submitted_at: at };
    return toProfileDTO({ attempt: done, institution_name: c.me.institution_name ?? null }, row, 'teacher',
      { items_answered: profile.items_answered, items_total: profile.items_total });
  });

  /* ── teacher reports ────────────────────────────────────────── */
  route('GET', '/profile/me', async (ctx) => {
    const c = teacherReader(ctx);
    const a = await c.repo.latestSubmittedAttempt(c.me.user_id);
    const p = a && (await c.repo.getProfile(a.attempt_id));
    if (!a || !p) throw new HttpError(404, { error: 'no_profile' });
    return toProfileDTO({ attempt: a, institution_name: c.me.institution_name ?? null }, p, 'teacher',
      { items_answered: a.item_order.length, items_total: a.item_order.length });
  });

  route('GET', '/preview', async (ctx) => {
    const c = teacher(ctx);
    if (!previewEnabled) throw new HttpError(404, { error: 'preview_disabled' });
    const a = await c.repo.findAttempt(c.me.user_id, c.access.cycle_id!);
    if (!a || a.status !== 'in_progress') throw new HttpError(404, { error: 'no_attempt' });
    const { profile } = await score(c.repo, a);
    return toProfileDTO({ attempt: a, institution_name: c.me.institution_name ?? null }, profile, 'teacher',
      { preview: true, items_answered: profile.items_answered, items_total: profile.items_total });
  });

  /* ── admin ──────────────────────────────────────────────────── */
  route('GET', '/admin/items', async (ctx, _p, req) => {
    admin(ctx);
    const q = req.query ?? {};
    const band = q.band && q.band !== 'All' ? q.band : undefined;
    const dimension = q.dimension && q.dimension !== 'All' ? q.dimension : undefined;
    if (band && !GRADE_BAND_IDS.includes(band)) throw new HttpError(400, { error: 'unknown_band' });
    if (dimension && !DIMENSION_NAMES.includes(dimension)) throw new HttpError(400, { error: 'unknown_dimension' });
    const items = await cfg.repo.listItems({ band, dimension });
    return items.map((i): BankItem => ({
      item_id: i.item_id, grade_band: i.grade_band, dimension: i.dimension, gate_dimension: i.gate_dimension, scenario: i.scenario,
      options: i.options.map((o) => ({ ...o })), source_tag: i.source_tag, version: i.version, active: i.active,
    }));
  });

  route('GET', '/admin/teachers', async (ctx) => {
    const c = admin(ctx);
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
    return out;
  });

  route('GET', '/admin/teachers/:teacherId/profile', async (ctx, p) => {
    const c = admin(ctx);
    const a = await c.repo.latestSubmittedAttempt(p.teacherId);
    const prof = a && (await c.repo.getProfile(a.attempt_id));
    if (!a || !prof) throw new HttpError(404, { error: 'no_profile' });
    await c.repo.audit({ actor_id: c.me.user_id, action: 'view_teacher_profile', target_teacher_id: a.teacher_id, attempt_id: a.attempt_id }, now());
    const [items, answers] = await Promise.all([itemsFor(a), c.repo.getAnswers(a.attempt_id)]);
    return toProfileDTO({ attempt: a, institution_name: c.me.institution_name ?? null }, prof, 'admin', {
      items_answered: a.item_order.length, items_total: a.item_order.length, item_level: itemLevelRows(items, answers),
    });
  });

  route('GET', '/admin/cohort', async (ctx) => {
    const c = admin(ctx);
    const rows = await c.repo.listSubmittedProfiles();
    const latest = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const cur = latest.get(row.attempt.teacher_id);
      if (!cur || (row.attempt.submitted_at ?? 0) > (cur.attempt.submitted_at ?? 0)) latest.set(row.attempt.teacher_id, row);
    }
    const agg = cohortAverages([...latest.values()].map((x) => x.profile), COHORT_MIN_N);
    return { n: agg.n, min_n: COHORT_MIN_N, available: agg.available, dims: agg.dims } satisfies CohortDTO;
  });

  /** Resolve identity + access once, then dispatch. Every route re-checks access. */
  async function handle(req: ServiceRequest): Promise<ServiceResponse> {
    try {
      const me = req.me;
      if (!me) throw new HttpError(401, { error: 'unauthenticated' });
      const repo = me.institution_id ? cfg.repo.forInstitution(me.institution_id) : null;
      const cycles = repo ? await repo.listCycles() : [];
      const access = cfg.accessOverride
        ? cfg.accessOverride(me, cycles, now())
        : resolveAccess(me, cycles, now(), {
            moduleEnabled: cfg.moduleEnabled ?? true,
            hasProfile: !!(repo && me.role === 'teacher' && (await repo.latestSubmittedAttempt(me.user_id))),
          });
      const ctx: Ctx = { me, access, repo };
      for (const [method, re, h] of routes) {
        if (method !== req.method.toUpperCase()) continue;
        const m = re.exec(req.path);
        if (!m) continue;
        const params = Object.fromEntries(Object.entries(m.groups ?? {}).map(([k, v]) => [k, decodeURIComponent(v)]));
        const out = await h(ctx, params, req);
        if (out && typeof out === 'object' && 'status' in out && 'body' in out && Object.keys(out).length === 2) return out as ServiceResponse;
        return { status: 200, body: out ?? null };
      }
      return { status: 404, body: { error: 'not_found' } };
    } catch (err) {
      if (err instanceof HttpError) return { status: err.status, body: err.body };
      if (err instanceof z.ZodError) return { status: 400, body: { error: 'invalid_request', message: err.issues.map((i) => i.message).join('; ') } };
      console.error('[teacher-assessment]', err);
      return { status: 500, body: { error: 'internal' } };
    }
  }

  return { handle };
}

export type TeacherAssessmentService = ReturnType<typeof createService>;
