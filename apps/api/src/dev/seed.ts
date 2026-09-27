/* Demo data for local development (TA_AUTH_MODE=dev, no DATABASE_URL).
   Ports the prototype's twelve-teacher roster and its deterministic demo answers. */
import { DIMENSIONS, dimByName, type DimensionId } from '@thisai/ta-shared';
import type { Cycle } from '../access';
import { DEV_INSTITUTION } from '../auth/dev-institution';
import { Presenter, profileRowFrom } from '../present';
import type { MemoryRepo } from '../repo/memory';
import type { ItemRow } from '../repo/types';
import { buildProfile, itemsForBand, seededRandom } from '../scoring/v1';

const DAY = 86400000;

export function devCycles(now: Date): Cycle[] {
  return [
    { cycle_id: 'cyc-stp-2', institution_id: DEV_INSTITUTION.id, name: 'Cycle 2', opens_at: new Date(now.getTime() - 30 * DAY), closes_at: new Date(now.getTime() + 60 * DAY), enabled: true },
    { cycle_id: 'cyc-stp-1', institution_id: DEV_INSTITUTION.id, name: 'Cycle 1', opens_at: new Date(now.getTime() - 200 * DAY), closes_at: new Date(now.getTime() - 120 * DAY), enabled: true },
    { cycle_id: 'cyc-lkv-1', institution_id: 'inst-lakeview', name: 'Cycle 1', opens_at: new Date(now.getTime() - 90 * DAY), closes_at: new Date(now.getTime() - 10 * DAY), enabled: true },
    // inst-greenfield has no enabled cycle → MODULE_DISABLED
    { cycle_id: 'cyc-grn-1', institution_id: 'inst-greenfield', name: 'Pilot', opens_at: new Date(now.getTime() - 30 * DAY), closes_at: new Date(now.getTime() + 30 * DAY), enabled: false },
  ];
}

type Skill = Partial<Record<DimensionId, number>>;

/** Deterministic demo answers — skill 0..1 per dimension drives how close to key. */
export function demoAnswers(items: ItemRow[], skill: Skill, salt: string) {
  const out: Record<string, { ranked: string[]; ms_on_item: number; note: string }> = {};
  for (const item of items) {
    const r = seededRandom(item.item_id + '#' + salt);
    const s = skill[dimByName(item.dimension)!.id] ?? 0.7;
    const order = item.options.slice().sort((a, b) => a.key_rank - b.key_rank).map((o) => o.label);
    const swaps = Math.round((1 - s) * 5);
    for (let k = 0; k < swaps; k++) {
      const i = Math.floor(r() * 3);
      [order[i], order[i + 1]] = [order[i + 1], order[i]];
    }
    out[item.item_id] = { ranked: order, ms_on_item: 15000 + Math.floor(r() * 45000), note: '' };
  }
  return out;
}

const ROSTER: { id: string; name: string; band: string; dept: string; daysAgo: number; rushed?: boolean; skill: Skill }[] = [
  { id: 'TCH-0318', name: 'Arun Sekar', band: 'High School (9-10)', dept: 'Mathematics', daysAgo: 15, skill: { equity: .7, deesc: .7, doubt: .95, adapt: .9, decide: .7, critical: .75, lead: .35 } },
  { id: 'TCH-0290', name: 'Fathima Noor', band: 'Primary (1-5)', dept: 'English', daysAgo: 16, skill: { equity: .95, deesc: .9, doubt: .9, adapt: .7, decide: .4, critical: .7, lead: .7 } },
  { id: 'TCH-0501', name: 'Deepak Venkatesh', band: 'High School (9-10)', dept: 'Social Science', daysAgo: 16, rushed: true, skill: { equity: .3, deesc: .35, doubt: .65, adapt: .35, decide: .7, critical: .4, lead: .65 } },
  { id: 'TCH-0155', name: 'Lakshmi Narayanan', band: 'Higher Secondary (11-12)', dept: 'Science', daysAgo: 17, skill: { equity: .75, deesc: .95, doubt: .7, adapt: .9, decide: .95, critical: .9, lead: .95 } },
  { id: 'TCH-0377', name: 'Rajesh Kumar', band: 'Middle (6-8)', dept: 'Mathematics', daysAgo: 17, skill: { equity: .65, deesc: .35, doubt: .4, adapt: .7, decide: .35, critical: .7, lead: .4 } },
  { id: 'TCH-0442', name: 'Priya Balaji', band: 'Pre-school', dept: 'General', daysAgo: 18, skill: { equity: .35, deesc: .7, doubt: .7, adapt: .4, decide: .7, critical: .65, lead: .35 } },
  { id: 'TCH-0203', name: 'Sundar Iyer', band: 'Higher Secondary (11-12)', dept: 'Physics', daysAgo: 18, skill: { equity: .9, deesc: .7, doubt: .95, adapt: .7, decide: .9, critical: .95, lead: .7 } },
  { id: 'TCH-0488', name: 'Kavitha Murugan', band: 'Middle (6-8)', dept: 'English', daysAgo: 19, skill: { equity: .7, deesc: .9, doubt: .7, adapt: .95, decide: .7, critical: .35, lead: .7 } },
  { id: 'TCH-0126', name: 'Joseph Anthony', band: 'College/UG', dept: 'Commerce', daysAgo: 19, skill: { equity: .7, deesc: .7, doubt: .4, adapt: .7, decide: .9, critical: .7, lead: .95 } },
  { id: 'TCH-0359', name: 'Nithya Selvam', band: 'Pre-school', dept: 'General', daysAgo: 20, skill: { equity: .9, deesc: .7, doubt: .9, adapt: .7, decide: .7, critical: .7, lead: .7 } },
  { id: 'TCH-0410', name: 'Vignesh Prabhu', band: 'College/UG', dept: 'Chemistry', daysAgo: 20, skill: { equity: .35, deesc: .7, doubt: .4, adapt: .35, decide: .7, critical: .7, lead: .4 } },
];

export async function seedDemo(repo: MemoryRepo, now: Date, presenter = new Presenter()) {
  for (const c of devCycles(now)) repo.addCycle(c);
  const inst = repo.forInstitution(DEV_INSTITUTION.id);
  const bank = await repo.listItems({ activeOnly: true });
  for (const t of ROSTER) {
    const items = itemsForBand(bank, t.band);
    const answers = demoAnswers(items, t.skill, t.id);
    if (t.rushed) for (const a of Object.values(answers)) a.ms_on_item = 3000 + (a.ms_on_item % 3000);
    const started = new Date(now.getTime() - t.daysAgo * DAY);
    const submitted = new Date(started.getTime() + 35 * 60000);
    const attempt_id = 'demo-' + t.id;
    await inst.createAttempt({
      attempt_id, teacher_id: t.id, institution_id: DEV_INSTITUTION.id, cycle_id: 'cyc-stp-2', grade_band: t.band,
      started_at: started, submitted_at: null, status: 'in_progress', item_order: items.map((i) => i.item_id),
      teacher_name: t.name, department: t.dept,
    });
    for (const [itemId, a] of Object.entries(answers))
      await inst.upsertAnswer(attempt_id, itemId, { ranked: a.ranked, note: a.note, flagged: false, ms_on_item: a.ms_on_item }, submitted);
    const profile = buildProfile(items, answers, t.band, { displayOrder: presenter.displayOrder });
    await inst.submit(attempt_id, profileRowFrom(attempt_id, profile, submitted), submitted);
  }
  return { teachers: ROSTER.length, dims: DIMENSIONS.length };
}
