/* Teacher Assessment scoring — v1.
   Pure functions only: no I/O, no clock, no randomness beyond the seeded PRNG.
   Implements docs/teacher-assessment.md Part 2 exactly as the prototype does.
   Every answer here is expressed in BANK labels (A–D as stored in ta_options). */
import {
  BANDS, DIMENSIONS, PROGRAMMES, dimByName, gradeBandLabel, indexBandFor,
  type Band, type DimensionId, type DimensionResult, type IndexBandId, type Insight,
  type PathStep, type ViewerRole,
} from '@thisai/ta-shared';

export const SCORING_VERSION = 'v1';

export interface ScoringOption { label: string; text: string; key_rank: number; rationale: string }
export interface ScoringItem {
  item_id: string;
  grade_band: string;
  dimension: string;
  scenario: string;
  source_tag?: string;
  options: ScoringOption[];
}
export type BankRanked = (string | null)[];
export interface ScoringAnswer { ranked: BankRanked; ms_on_item?: number; note?: string }

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ── 1. Test assembly ─────────────────────────────────────────────── */

/** Every item for one grade band, round-robined across the seven dimensions
    so no two scenarios from the same dimension sit next to each other. */
export function itemsForBand<T extends { grade_band: string; dimension: string }>(bank: T[], band: string): T[] {
  const cells = DIMENSIONS.map((d) => bank.filter((i) => i.grade_band === band && i.dimension === d.name));
  const depth = Math.max(0, ...cells.map((c) => c.length));
  const out: T[] = [];
  for (let r = 0; r < depth; r++) for (const c of cells) if (c[r]) out.push(c[r]);
  return out;
}

/* ── 2. Option order ──────────────────────────────────────────────── */

/** FNV-1a hash of the string, then a mulberry32 PRNG seeded with it. */
export function seededRandom(str: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Presentation order — deterministic per item, never the key order.
    `salt` is empty by default (spec behaviour); see README for TA_SHUFFLE_SALT. */
export function shuffledOptions<O extends { key_rank: number }>(item: { item_id: string; options: O[] }, salt = ''): O[] {
  const r = seededRandom(item.item_id + '#opts' + salt);
  const a = item.options.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (a[0].key_rank === 1 && a[3].key_rank === 4) [a[0], a[2]] = [a[2], a[0]];
  return a;
}

/* ── 3. Item score ────────────────────────────────────────────────── */

export function isComplete(ranked: BankRanked | undefined | null): ranked is string[] {
  return !!ranked && ranked.length === 4 && ranked.every(Boolean);
}

/** Total rank displacement from the keyed order, normalised to 0–3. */
export function displacement(item: ScoringItem, ranked: string[]): number {
  let dev = 0;
  ranked.forEach((label, pos) => {
    const o = item.options.find((x) => x.label === label);
    if (!o) throw new Error(`Unknown option ${label} on ${item.item_id}`);
    dev += Math.abs(o.key_rank - (pos + 1));
  });
  return dev;
}

export function scoreItem(item: ScoringItem, ranked: BankRanked | undefined | null): number | null {
  if (!isComplete(ranked)) return null;
  return round2(3 * (1 - displacement(item, ranked) / 8));
}

/* ── 4. Dimension bands ───────────────────────────────────────────── */

export const bandFor = (s: number): Band => (s >= 2.3 ? 'strong' : s >= 1.3 ? 'consistent' : 'developing');

/* ── 8. Coaching note ─────────────────────────────────────────────── */

interface Entry { item: ScoringItem; ranked: string[]; score: number }

export const trimText = (t: string) => (t.length > 96 ? t.slice(0, 93).replace(/[\s,;]+$/, '') + '…' : t);
const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
export function contextPhrase(item: { scenario: string }): string {
  const s = item.scenario.replace(/^(During|At|In|On)\s+/i, '').replace(/^(a|an|the)\s+/i, '');
  return s.split(/[,.;]/)[0].split(' ').slice(0, 6).join(' ').toLowerCase();
}

export function coachingNote(entries: Entry[], role: ViewerRole): string {
  const worst = entries.slice().sort((a, b) => a.score - b.score)[0];
  const opt = (label: string) => worst.item.options.find((o) => o.label === label)!;
  const byKey = (k: number) => worst.item.options.find((o) => o.key_rank === k)!;
  const chosenFirst = opt(worst.ranked[0]);
  const chosenLast = opt(worst.ranked[3]);
  const keyBest = byKey(1);
  const keyWorst = byKey(4);
  const adm = role === 'admin';
  if (chosenFirst.label === keyBest.label && chosenLast.label === keyWorst.label)
    return 'Across the scenarios in this dimension, the strongest and weakest responses were placed where the framework places them — ' +
      lower(keyBest.rationale) +
      ' Where the ranking differed, it was only in the middle two options, which separate good practice from slightly better practice.';
  if (chosenFirst.label === keyBest.label)
    return 'The best response was identified in the scenarios answered (' + lower(keyBest.rationale).replace(/\.$/, '') +
      ') but the weakest option was not ranked last — "' + trimText(chosenLast.text) + '" was placed below "' +
      trimText(keyWorst.text) + '". ' +
      (adm ? 'The instinct is right; the reading of what does most harm is less sharp.'
           : 'Your instinct is right; the reading of what does most harm is less sharp.');
  return 'In the ' + contextPhrase(worst.item) + ' scenario, ' + (adm ? 'this teacher' : 'you') + ' ranked "' +
    trimText(chosenFirst.text) + '" first. The framework places "' + trimText(keyBest.text) + '" first — ' +
    lower(keyBest.rationale);
}

/* ── Profile core ─────────────────────────────────────────────────── */

export interface DimScore {
  dimension_id: DimensionId;
  dimension_name: string;
  band: Band | null;
  score_0_to_3: number | null;
  items_scored: number;
  coaching_note: { teacher: string; admin: string } | null;
  action: string;
}

const NOT_ASSESSED_NOTE = 'Not yet assessed — the scenarios for this dimension have not been ranked.';

export function dimensionScores(items: ScoringItem[], answers: Record<string, ScoringAnswer | undefined>): DimScore[] {
  return DIMENSIONS.map((meta) => {
    const entries: Entry[] = items
      .filter((i) => i.dimension === meta.name)
      .map((item) => {
        const ranked = answers[item.item_id]?.ranked;
        return { item, ranked: ranked as string[], score: scoreItem(item, ranked) as number };
      })
      .filter((e) => e.score !== null);
    const avg = entries.length ? entries.reduce((s, e) => s + e.score, 0) / entries.length : null;
    return {
      dimension_id: meta.id,
      dimension_name: meta.name,
      band: avg === null ? null : bandFor(round2(avg)),
      score_0_to_3: avg === null ? null : round2(avg),
      items_scored: entries.length,
      coaching_note: entries.length ? { teacher: coachingNote(entries, 'teacher'), admin: coachingNote(entries, 'admin') } : null,
      action: meta.action,
    };
  });
}

/* ── 5. Equity gate ───────────────────────────────────────────────── */

export function equityGate(dims: Pick<DimScore, 'dimension_id' | 'items_scored' | 'band'>[]): boolean {
  const eq = dims.find((d) => d.dimension_id === 'equity');
  return !!eq && eq.items_scored > 0 && eq.band === 'developing';
}

/* ── 6. Teaching Practice Index ───────────────────────────────────── */

type Scored = { dimension_id: DimensionId; dimension_name: string; score_0_to_3: number | null; band?: Band | null };

export interface IndexResult { value: number; mean: number; dims_scored: number; band: IndexBandId; label: string }
export function indexFor(dims: Pick<Scored, 'score_0_to_3'>[]): IndexResult | null {
  const scored = dims.filter((d) => d.score_0_to_3 !== null);
  if (!scored.length) return null;
  const mean = scored.reduce((s, d) => s + (d.score_0_to_3 as number), 0) / scored.length;
  const value = Math.round((mean / 3) * 100);
  const b = indexBandFor(value);
  return { value, mean: round2(mean), dims_scored: scored.length, band: b.id, label: b.label };
}

/* ── 7. Strengths & growth (disjoint by construction) ─────────────── */

export function rankedDims<T extends Scored>(dims: T[]): T[] {
  return dims.filter((d) => d.score_0_to_3 !== null).slice().sort((a, b) => (b.score_0_to_3 as number) - (a.score_0_to_3 as number));
}
const halfN = (n: number) => Math.min(2, Math.floor(n / 2));
export function strengthsOf<T extends Scored>(dims: T[]): T[] {
  const r = rankedDims(dims);
  return r.slice(0, halfN(r.length));
}
export function growthOf<T extends Scored>(dims: T[]): T[] {
  const r = rankedDims(dims);
  const k = halfN(r.length);
  return k ? r.slice(r.length - k).reverse() : [];
}

/* ── 9. Insights ──────────────────────────────────────────────────── */

const shortName = (name: string) => name.replace(/ \/ .*/, '');

export function insightsFor(dims: DimScore[], gradeBand: string, role: ViewerRole): Insight[] {
  const adm = role === 'admin';
  const YOUR = adm ? "This teacher's" : 'Your';
  const YOU = adm ? 'this teacher' : 'you';
  const out: Insight[] = [];
  const st = strengthsOf(dims);
  const gr = growthOf(dims);
  const scored = dims.filter((d) => d.score_0_to_3 !== null).length;
  if (scored < 2) {
    out.push({
      ic: '◔',
      text: 'Only ' + scored + ' of the seven dimensions ' + (scored === 1 ? 'has' : 'have') +
        ' enough rankings so far. Strengths, gaps and the development path appear once at least two dimensions are complete — a single dimension cannot be compared against anything.',
    });
  } else {
    const s0 = st[0], g0 = gr[0];
    out.push({
      ic: '▲',
      text: YOUR + ' sharpest instinct is ' + shortName(s0.dimension_name) + ' (' + (s0.score_0_to_3 as number).toFixed(2) +
        ' of 3.00). In the ' + gradeBandLabel(gradeBand).toLowerCase() + ' scenarios for this dimension ' + YOU +
        ' ranked the responses closest to where the framework places them.',
    });
    out.push({
      ic: '▼',
      text: 'The widest gap is ' + shortName(g0.dimension_name) + ' (' + (g0.score_0_to_3 as number).toFixed(2) +
        ' of 3.00) — far enough from ' + (adm ? 'their' : 'your') +
        ' strongest dimension that it is a difference in practice, not measurement noise.',
    });
    const spread = (s0.score_0_to_3 as number) - (g0.score_0_to_3 as number);
    out.push({
      ic: '≈',
      text: round2(spread) >= 1.2
        ? YOUR + ' profile is uneven — more than a full point separates the best and weakest dimensions. Uneven profiles respond well to one narrow intervention rather than general professional development.'
        : YOUR + ' profile is even across dimensions. There is no single weak spot to fix, so the gain here comes from raising the ceiling on an existing strength rather than repairing a gap.',
    });
  }
  const eq = dims.find((d) => d.dimension_id === 'equity');
  const eqN = eq ? eq.items_scored : 0;
  if (equityGate(dims))
    out.push({
      ic: '!',
      text: 'Equity of treatment sits in the Developing band. It is treated separately from the other six dimensions because it describes not how ' +
        (adm ? 'a teacher teaches' : 'you teach') + ' but who receives it — see the priority section above.',
    });
  else if (eqN >= 2)
    out.push({
      ic: '✓',
      text: 'Equity of treatment is clear. Across the ' + eqN + ' equity scenarios answered, ' + YOU +
        " applied the same process and tone regardless of a child's reputation, which is the single behaviour this instrument weights most heavily.",
    });
  else if (eqN === 1)
    out.push({
      ic: '✓',
      text: 'In the one equity scenario answered so far, ' + YOU +
        " applied the same process and tone regardless of a child's reputation. The remaining equity scenarios are still unranked, so the dimension is not yet settled — it is the one this instrument weights most heavily.",
    });
  return out.slice(0, 4);
}

/* ── 10. Six-week path ────────────────────────────────────────────── */

export function pathFor(dims: DimScore[], role: ViewerRole): PathStep[] {
  const adm = role === 'admin';
  if (dims.filter((d) => d.score_0_to_3 !== null).length < 2) return [];
  const gr = growthOf(dims);
  const st = strengthsOf(dims)[0];
  const a = gr[0] ? PROGRAMMES[gr[0].dimension_id] : null;
  const b = gr[1] ? PROGRAMMES[gr[1].dimension_id] : null;
  const steps: PathStep[] = [];
  if (a) steps.push({ wk: 'Weeks 1–2', t: a.title + ' — ' + gr[0].dimension_name, d: a.what });
  steps.push({
    wk: 'Week 3', t: 'Peer observation, one focus only',
    d: 'A colleague watches one lesson and records nothing except ' +
      (gr[0] ? gr[0].dimension_name.toLowerCase() : 'the focus dimension') +
      '. Twenty minutes of debrief, no written record, not used for appraisal.',
  });
  if (b) steps.push({ wk: 'Weeks 4–5', t: b.title + ' — ' + gr[1].dimension_name, d: b.what });
  steps.push({
    wk: 'Week 6', t: 'Reassess and compare',
    d: (adm ? 'The teacher retakes' : 'Retake') +
      ' the reflection on the same grade band. The comparison worth reading is per dimension, not the index — a five-point index move can hide the only change that mattered.',
  });
  if (st)
    steps.push({
      wk: 'Ongoing', t: (adm ? 'Deploy their strength in ' : 'Use your strength in ') + shortName(st.dimension_name),
      d: 'Academic heads pair teachers on complementary profiles. This dimension is where ' + (adm ? 'this teacher' : 'you') +
        ' would be most useful to a colleague, and mentoring is the fastest way to consolidate it.',
    });
  return steps;
}

/* ── 11. Cohort benchmark ─────────────────────────────────────────── */

export function cohortAverages(profiles: { dims: Pick<DimScore, 'dimension_id' | 'score_0_to_3'>[] }[], minN = 5) {
  const n = profiles.length;
  if (n < minN) return { n, available: false as const, dims: null };
  const dims: Partial<Record<DimensionId, number | null>> = {};
  for (const d of DIMENSIONS) {
    const vals = profiles
      .map((p) => p.dims.find((x) => x.dimension_id === d.id)?.score_0_to_3)
      .filter((v): v is number => v !== null && v !== undefined);
    dims[d.id] = vals.length ? round2(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  }
  return { n, available: true as const, dims };
}

/* ── 12. Validity flag ────────────────────────────────────────────── */

export const VALIDITY = { minMedianMs: 8000, sameRankShare: 0.8, exactKeyOf35: 30 };

export interface ValidityResult { flag: boolean; reasons: string[]; median_ms: number | null; exact_key_items: number }

export function validityFor(
  items: ScoringItem[],
  answers: Record<string, ScoringAnswer | undefined>,
  displayOrder: (item: ScoringItem) => string[] = (item) => shuffledOptions(item).map((o) => o.label),
): ValidityResult {
  const reasons: string[] = [];
  const complete = items.filter((i) => isComplete(answers[i.item_id]?.ranked));

  const times = complete.map((i) => answers[i.item_id]?.ms_on_item ?? 0).filter((ms) => ms > 0).sort((a, b) => a - b);
  let median: number | null = null;
  if (times.length) {
    const m = Math.floor(times.length / 2);
    median = times.length % 2 ? times[m] : (times[m - 1] + times[m]) / 2;
    if (median < VALIDITY.minMedianMs)
      reasons.push(`Median time per item was ${(median / 1000).toFixed(1)}s (under ${VALIDITY.minMedianMs / 1000}s).`);
  }

  // Position bias. "Option label" means the label the teacher sees (A–D by display
  // position). Bank labels are not used: in the bank A–D follow the keyed order, so a
  // bank-label rule would flag exactly the teachers who agree with the framework.
  if (complete.length) {
    const displayAt = new Map<string, number>();
    for (const i of complete) {
      const disp = displayOrder(i);
      (answers[i.item_id]!.ranked as string[]).forEach((label, pos) => {
        const k = pos + ':' + disp.indexOf(label);
        displayAt.set(k, (displayAt.get(k) ?? 0) + 1);
      });
    }
    const need = VALIDITY.sameRankShare * complete.length;
    for (const [k, v] of displayAt) if (v >= need) {
      const [pos, disp] = k.split(':');
      reasons.push(`Option ${'ABCD'[+disp]} (as shown) was placed at rank ${+pos + 1} on ${v} of ${complete.length} items.`);
      break;
    }
  }

  const exact = complete.filter((i) => displacement(i, answers[i.item_id]!.ranked as string[]) === 0).length;
  const exactNeed = Math.ceil((VALIDITY.exactKeyOf35 / 35) * items.length);
  if (items.length && exact >= exactNeed)
    reasons.push(`${exact} of ${items.length} items were in the exact keyed order.`);

  return { flag: reasons.length > 0, reasons, median_ms: median, exact_key_items: exact };
}

/* ── Whole profile ────────────────────────────────────────────────── */

export interface ScoredProfile {
  scoring_version: string;
  grade_band: string;
  index: number | null;
  index_mean: number | null;
  index_band: IndexBandId | null;
  dims: DimScore[];
  equity_gate: boolean;
  strengths: DimensionId[];
  growth: DimensionId[];
  insights: Record<ViewerRole, Insight[]>;
  path: Record<ViewerRole, PathStep[]>;
  validity: ValidityResult;
  items_answered: number;
  items_total: number;
}

export function buildProfile(
  items: ScoringItem[],
  answers: Record<string, ScoringAnswer | undefined>,
  gradeBand: string,
  opts: { displayOrder?: (item: ScoringItem) => string[] } = {},
): ScoredProfile {
  const dims = dimensionScores(items, answers);
  const idx = indexFor(dims);
  return {
    scoring_version: SCORING_VERSION,
    grade_band: gradeBand,
    index: idx?.value ?? null,
    index_mean: idx?.mean ?? null,
    index_band: idx?.band ?? null,
    dims,
    equity_gate: equityGate(dims),
    strengths: strengthsOf(dims).map((d) => d.dimension_id),
    growth: growthOf(dims).map((d) => d.dimension_id),
    insights: { teacher: insightsFor(dims, gradeBand, 'teacher'), admin: insightsFor(dims, gradeBand, 'admin') },
    path: { teacher: pathFor(dims, 'teacher'), admin: pathFor(dims, 'admin') },
    validity: validityFor(items, answers, opts.displayOrder),
    items_answered: items.filter((i) => isComplete(answers[i.item_id]?.ranked)).length,
    items_total: items.length,
  };
}

/** Role-specific dimension rows for the API. `withNotes=false` hides key-revealing notes (live preview). */
export function dimsForRole(dims: DimScore[], role: ViewerRole, withNotes = true): DimensionResult[] {
  return dims.map((d) => ({
    dimension_id: d.dimension_id,
    dimension_name: d.dimension_name,
    band: d.band,
    score_0_to_3: d.score_0_to_3,
    items_scored: d.items_scored,
    coaching_note: !withNotes ? null : d.coaching_note ? d.coaching_note[role] : NOT_ASSESSED_NOTE,
    action: d.action,
  }));
}

export { BANDS, dimByName };
