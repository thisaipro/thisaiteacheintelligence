import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AttemptDTO, ProfileDTO } from '@thisai/ta-shared';
import { createApp } from '../src/app';
import { devIdentity } from '../src/auth/identity';
import { loadBank } from '../src/bank';
import { seedDemo } from '../src/dev/seed';
import { Presenter } from '../src/present';
import { MemoryRepo } from '../src/repo/memory';

const NOW = new Date('2026-09-27T10:00:00Z');
const bank = loadBank();

async function setup() {
  const repo = new MemoryRepo({ items: bank });
  await seedDemo(repo, NOW);
  const app = createApp({ repo, identity: devIdentity(), now: () => NOW });
  const as = (user: string) => ({
    get: (u: string) => request(app).get('/api/teacher-assessment' + u).set('x-ta-dev-user', user),
    post: (u: string, b?: object) => request(app).post('/api/teacher-assessment' + u).set('x-ta-dev-user', user).send(b ?? {}),
    put: (u: string, b: object) => request(app).put('/api/teacher-assessment' + u).set('x-ta-dev-user', user).send(b),
  });
  return { repo, app, as };
}

/** Rank every item in display order with a deterministic, varied pattern. */
const patterns = [['B', 'A', 'C', 'D'], ['A', 'C', 'B', 'D'], ['D', 'A', 'B', 'C'], ['C', 'B', 'A', 'D'], ['A', 'B', 'D', 'C']];

describe('teacher-assessment API', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { ctx = await setup(); });

  it('GET /access for each account', async () => {
    expect((await ctx.as('t').get('/access')).body).toEqual({ can_take: true, can_manage: false, reason: null, cycle_id: 'cyc-stp-2', cycle_name: 'Cycle 2', has_profile: false });
    expect((await ctx.as('a').get('/access')).body).toMatchObject({ can_take: false, can_manage: true, reason: null });
    expect((await ctx.as('s').get('/access')).body).toMatchObject({ can_take: false, can_manage: false, reason: 'NOT_TEACHER' });
    expect((await ctx.as('i').get('/access')).body).toMatchObject({ reason: 'NO_INSTITUTION' });
    expect((await ctx.as('d').get('/access')).body).toMatchObject({ reason: 'MODULE_DISABLED' });
    expect((await ctx.as('c').get('/access')).body).toMatchObject({ reason: 'CYCLE_CLOSED' });
    expect((await ctx.as('none').get('/access')).status).toBe(401);
  });

  it('every teacher and admin route re-checks access server-side', async () => {
    const teacherRoutes = [
      ['post', '/attempts', { grade_band: 'Pre-school' }], ['get', '/attempts/current'], ['put', '/attempts/x/answers/y', { ranked: ['A', 'B', 'C', 'D'] }],
      ['post', '/attempts/x/submit'], ['get', '/profile/me'], ['get', '/preview'],
    ] as const;
    const adminRoutes = [['get', '/admin/items'], ['get', '/admin/teachers'], ['get', '/admin/teachers/TCH-0318/profile'], ['get', '/admin/cohort']] as const;
    for (const user of ['s', 'i', 'd']) {
      for (const [m, u, b] of [...teacherRoutes, ...adminRoutes] as any[]) {
        const res = await (ctx.as(user) as any)[m](u, b);
        expect(res.status, `${user} ${m} ${u}`).toBe(403);
        expect(['NOT_TEACHER', 'NO_INSTITUTION', 'MODULE_DISABLED']).toContain(res.body.reason);
      }
    }
    for (const [m, u, b] of teacherRoutes as any) expect((await (ctx.as('a') as any)[m](u, b)).status, `admin ${u}`).toBe(403);
    for (const [m, u, b] of adminRoutes as any) expect((await (ctx.as('t') as any)[m](u, b)).body.reason, `teacher ${u}`).toBe('NOT_ADMIN');
    expect((await ctx.as('c').post('/attempts', { grade_band: 'Pre-school' })).body.reason).toBe('CYCLE_CLOSED');
  });

  it('full teacher journey: start → autosave → preview → submit → profile', async () => {
    const t = ctx.as('t');
    expect((await t.get('/attempts/current')).body).toBeNull();
    const start = await t.post('/attempts', { grade_band: 'Middle (6-8)' });
    expect(start.status).toBe(201);
    const attempt: AttemptDTO = start.body;
    expect(attempt.items).toHaveLength(35);

    // No keys ever reach the client.
    const raw = JSON.stringify(attempt);
    expect(raw).not.toMatch(/key_rank|points|rationale/);
    for (const it of attempt.items) expect(it.options.map((o) => o.label)).toEqual(['A', 'B', 'C', 'D']);
    // Round-robin order is preserved.
    for (let i = 1; i < attempt.items.length; i++) expect(attempt.items[i].dimension).not.toBe(attempt.items[i - 1].dimension);

    // Same POST again resumes instead of restarting.
    expect((await t.post('/attempts', { grade_band: 'Middle (6-8)' })).body.attempt_id).toBe(attempt.attempt_id);

    const id = attempt.attempt_id;
    // Invalid rankings are rejected.
    expect((await t.put(`/attempts/${id}/answers/${attempt.items[0].item_id}`, { ranked: ['A', 'A', null, null] })).status).toBe(400);
    expect((await t.put(`/attempts/${id}/answers/NOT-AN-ITEM`, { ranked: ['A', 'B', 'C', 'D'] })).status).toBe(404);

    // Partial answer, flag + note round-trip.
    const first = attempt.items[0].item_id;
    const put = await t.put(`/attempts/${id}/answers/${first}`, { ranked: ['B', null, null, null], flagged: true, note: 'I would kneel down first.', ms: 12000 });
    expect(put.body).toMatchObject({ ranked: ['B', null, null, null], flagged: true, note: 'I would kneel down first.', ms_on_item: 12000 });
    // ms never goes backwards on replay of an older queued PUT.
    expect((await t.put(`/attempts/${id}/answers/${first}`, { ranked: ['B', 'A', null, null], ms: 4000 })).body).toMatchObject({ ms_on_item: 12000, flagged: true });

    // Submit before complete → 422.
    const early = await t.post(`/attempts/${id}/submit`);
    expect(early.status).toBe(422);
    expect(early.body.missing).toHaveLength(35);

    for (const [n, it] of attempt.items.entries())
      await t.put(`/attempts/${id}/answers/${it.item_id}`, { ranked: patterns[n % patterns.length], ms: 20000 + n * 100 });

    const cur: AttemptDTO = (await t.get('/attempts/current')).body;
    expect(Object.values(cur.answers).every((a) => a.ranked.every(Boolean))).toBe(true);
    expect(cur.answers[attempt.items[3].item_id].ranked).toEqual(patterns[3]);

    // Live preview: labelled, no key-revealing notes, no admin fields.
    const prev: ProfileDTO = (await t.get('/preview')).body;
    expect(prev.preview).toBe(true);
    expect(prev.dims.every((d) => d.coaching_note === null)).toBe(true);
    expect(prev).not.toHaveProperty('validity_flag');
    expect(prev.index).not.toBeNull();

    const sub = await t.post(`/attempts/${id}/submit`);
    expect(sub.status).toBe(200);
    const profile: ProfileDTO = sub.body;
    expect(profile).toMatchObject({ preview: false, scoring_version: 'v1', items_answered: 35, teacher_name: 'Meenakshi Raghavan' });
    expect(profile.index).toBe(prev.index);
    expect(profile.dims.every((d) => typeof d.coaching_note === 'string')).toBe(true);
    expect(profile).not.toHaveProperty('validity_flag');
    expect(profile).not.toHaveProperty('item_level');
    expect(profile.insights[0].text).toMatch(/^Your/);

    // Locked.
    expect((await t.put(`/attempts/${id}/answers/${first}`, { ranked: ['A', 'B', 'C', 'D'] })).status).toBe(409);
    expect((await t.post(`/attempts/${id}/submit`)).status).toBe(409);
    expect((await t.post('/attempts', { grade_band: 'Middle (6-8)', restart: true })).status).toBe(409);
    expect((await t.get('/profile/me')).body.attempt_id).toBe(id);
    expect((await t.get('/access')).body.has_profile).toBe(true);
  });

  it('restart / band change resets answers', async () => {
    const t = ctx.as('t');
    const a: AttemptDTO = (await t.post('/attempts', { grade_band: 'Pre-school' })).body;
    await t.put(`/attempts/${a.attempt_id}/answers/${a.items[0].item_id}`, { ranked: ['A', 'B', 'C', 'D'] });
    const b: AttemptDTO = (await t.post('/attempts', { grade_band: 'College/UG' })).body;
    expect(b.attempt_id).toBe(a.attempt_id);
    expect(b.grade_band).toBe('College/UG');
    expect(b.answers).toEqual({});
  });

  it('admin: bank with keys, roster, cohort, audited teacher profile', async () => {
    const adm = ctx.as('a');
    const items = (await adm.get('/admin/items?band=Middle%20(6-8)&dimension=Equity%20of%20Treatment')).body;
    expect(items).toHaveLength(5);
    expect(items[0].options[0]).toHaveProperty('key_rank');
    expect((await adm.get('/admin/items')).body).toHaveLength(bank.length);
    expect((await adm.get('/admin/items?band=Nope')).status).toBe(400);

    const roster = (await adm.get('/admin/teachers')).body;
    expect(roster).toHaveLength(11);
    const rushed = roster.find((r: any) => r.teacher_id === 'TCH-0501');
    expect(rushed.validity_flag).toBe(true);
    expect(roster.find((r: any) => r.teacher_id === 'TCH-0203').validity_flag).toBe(false);

    const cohort = (await adm.get('/admin/cohort')).body;
    expect(cohort).toMatchObject({ n: 11, min_n: 5, available: true });
    expect(typeof cohort.dims.equity).toBe('number');

    const p: ProfileDTO = (await adm.get('/admin/teachers/TCH-0501/profile')).body;
    expect(p.validity_flag).toBe(true);
    expect(p.validity_reasons!.length).toBeGreaterThan(0);
    expect(p.item_level).toHaveLength(35);
    expect(p.insights[0].text).toMatch(/^This teacher's/);
    expect(ctx.repo.state.audit).toEqual([expect.objectContaining({ actor_id: 'ADM-0001', action: 'view_teacher_profile', target_teacher_id: 'TCH-0501' })]);
    expect((await adm.get('/admin/teachers/NOBODY/profile')).status).toBe(404);
  });

  it('cohort is withheld under N = 5', async () => {
    const repo = new MemoryRepo({ items: bank });
    const app = createApp({ repo, identity: devIdentity(), now: () => NOW });
    const { devCycles } = await import('../src/dev/seed');
    for (const c of devCycles(NOW)) repo.addCycle(c);
    const res = await request(app).get('/api/teacher-assessment/admin/cohort').set('x-ta-dev-user', 'a');
    expect(res.body).toEqual({ n: 0, min_n: 5, available: false, dims: null });
  });

  it('institution scoping: another institution cannot touch an attempt', async () => {
    const t = ctx.as('t');
    const a: AttemptDTO = (await t.post('/attempts', { grade_band: 'Pre-school' })).body;
    const other = ctx.repo.forInstitution('inst-lakeview');
    expect(await other.getAttempt(a.attempt_id)).toBeNull();
    expect(await other.getAnswers(a.attempt_id)).toEqual([]);
  });

  it('display labels map back to bank labels (keys never inferable from labels)', async () => {
    const p = new Presenter();
    const item = bank.find((i) => i.item_id === 'PS-EQ-01')!; // display order D C B A
    expect(p.toClientItem(item).options.map((o) => o.text)).toEqual(['D', 'C', 'B', 'A'].map((l) => item.options.find((o) => o.label === l)!.text));
    expect(p.toBank(item, ['D', 'C', 'B', 'A'])).toEqual(['A', 'B', 'C', 'D']);
    expect(p.toClient(item, ['A', 'B', null, null])).toEqual(['D', 'C', null, null]);
  });
});
