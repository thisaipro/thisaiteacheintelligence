/* buildReportView — the single, pure view model behind the report screen and its
   PDF/print output. Components only render what this returns. */
import {
  BANDS, BAND_HEX, BAND_TEXT, DIMENSIONS, INDEX_BANDS, KPI_CLASS, PROGRAMMES, dimById, gradeBandLabel,
  type Band, type DimensionId, type Programme,
} from './bands';
import { COPY } from './copy';
import type { CohortDTO, Insight, ItemLevelRow, PathStep, ProfileDTO, ViewerRole } from './types';

export interface DimRowView {
  id: DimensionId;
  name: string;
  short: string;
  blurb: string;
  gate: boolean;
  band: Band | null;
  bandLabel: string;
  note: string | null;
  action: string;
  /** Admin only: "2.40 of 3.00 · Strong band (2.3 – 3.0)" and item count. */
  adminNums: { score: string | null; detail: string; items: string } | null;
}

export interface BarView { id: DimensionId; label: string; sub: string; score: number | null; pct: number; band: Band | null; avg: number | null }
export interface KpiView { k: string; v: string; s: string; cls: string; color?: string }
export interface AreaView { id: DimensionId; name: string; score: string; blurb: string }

export interface ReportView {
  role: ViewerRole;
  admin: boolean;
  preview: boolean;
  previewBanner: string | null;
  name: string;
  pills: string[];
  equityPill: boolean;
  index: { value: number; band: Band; label: string; color: string; frame: string } | null;
  indexLine: string;
  frame: string;
  kpis: KpiView[];
  readout: boolean;
  validity: { reasons: string[] } | null;
  radar: { id: DimensionId; short: string; score: number | null; avg: number | null }[];
  radarNote: string;
  bars: BarView[];
  barsTitle: string;
  barsNote: string;
  distribution: Record<Band | 'unscored', number>;
  equityGate: { note: string | null; action: string; body: string } | null;
  showAreas: boolean;
  strengths: AreaView[];
  growth: AreaView[];
  insights: Insight[];
  cohort: { n: number; available: boolean; rows: { id: DimensionId; name: string; mine: number | null; avg: number | null; diff: number | null; band: Band | null }[] } | null;
  dimRows: DimRowView[];
  programmes: (Programme & { id: DimensionId; dimShort: string })[];
  path: PathStep[];
  footNote: string;
  itemLevel: ItemLevelRow[] | null;
  copy: { subtitle: string; insightsDesc: string; recommended: string; pathTitle: string; profileTitle: string; profileDesc: string };
}

const fmt = (n: number) => n.toFixed(2);
const shortDim = (name: string) => name.replace(/ \/ .*/, '');

export function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

export function buildReportView(profile: ProfileDTO, role: ViewerRole, cohort?: CohortDTO | null): ReportView {
  const admin = role === 'admin';
  const dims = profile.dims;
  const byId = new Map(dims.map((d) => [d.dimension_id, d]));
  const scored = dims.filter((d) => d.score_0_to_3 !== null);
  const bandLabel = gradeBandLabel(profile.grade_band);
  // Teachers are promised no comparison against colleagues — the benchmark is admin-only.
  const cohortDims = admin && cohort?.available && cohort.dims ? cohort.dims : null;

  const indexBand = INDEX_BANDS.find((b) => b.id === profile.index_band) ?? null;
  const index = profile.index !== null && indexBand
    ? { value: profile.index, band: indexBand.id, label: indexBand.label, color: BAND_HEX[indexBand.id], frame: admin ? indexBand.frameAdmin : indexBand.frame }
    : null;

  const area = (id: DimensionId): AreaView => {
    const d = byId.get(id)!;
    return { id, name: d.dimension_name, score: fmt(d.score_0_to_3 as number), blurb: dimById(id)!.blurb };
  };
  const strengths = profile.strengths.map(area);
  const growth = profile.growth.map(area);
  const eq = byId.get('equity');

  const counts: Record<Band | 'unscored', number> = { strong: 0, consistent: 0, developing: 0, unscored: 0 };
  for (const d of dims) counts[d.band ?? 'unscored']++;

  const s0 = strengths[0] ? byId.get(strengths[0].id)! : null;
  const g0 = growth[0] ? byId.get(growth[0].id)! : null;
  const need2 = admin ? 'Needs two scored dimensions' : 'Needs two dimensions ranked';
  const kpis: KpiView[] = [
    { k: 'Strongest dimension', v: s0 ? dimById(s0.dimension_id)!.short : '—', s: s0 ? fmt(s0.score_0_to_3!) + ' of 3.00' : need2, cls: s0 ? KPI_CLASS[s0.band!] : '' },
    { k: 'Widest gap', v: g0 ? dimById(g0.dimension_id)!.short : '—', s: g0 ? fmt(g0.score_0_to_3!) + ' of 3.00' : need2, cls: g0 ? KPI_CLASS[g0.band!] : '' },
    {
      k: 'Equity gate',
      v: profile.equity_gate ? 'Raised' : eq?.band ? 'Clear' : 'Pending',
      s: profile.equity_gate ? 'Priority conversation this cycle' : eq?.band ? 'Same treatment regardless of reputation' : 'Equity scenarios not yet ranked',
      cls: profile.equity_gate ? 'warn' : eq?.band ? KPI_CLASS[eq.band] : '',
    },
  ];
  if (admin) {
    let vs: number | null = null;
    if (cohortDims && scored.length) {
      const mine = scored.reduce((s, d) => s + d.score_0_to_3!, 0) / scored.length;
      const av = scored.map((d) => cohortDims[d.dimension_id]).filter((x): x is number => typeof x === 'number');
      if (av.length) vs = Math.round(((mine - av.reduce((a, b) => a + b, 0) / av.length) / 3) * 100);
    }
    kpis.push({
      k: 'vs school average',
      v: vs === null ? '—' : (vs > 0 ? '+' : '') + vs + (Math.abs(vs) === 1 ? ' pt' : ' pts'),
      s: cohort ? (cohort.available ? `${cohort.n} teachers assessed` : `Shown once ${cohort.min_n} teachers have submitted`) + ` · ${profile.items_answered} of ${profile.items_total} scenarios answered` : `${profile.items_answered} of ${profile.items_total} scenarios answered`,
      cls: '',
      color: vs === null ? undefined : vs > 0 ? 'var(--strong-t)' : vs < 0 ? 'var(--developing-t)' : 'var(--ink)',
    });
  } else {
    kpis.push({
      k: 'Scenarios answered',
      v: `${profile.items_answered} of ${profile.items_total}`,
      s: `${counts.strong} strong · ${counts.consistent} consistent · ${counts.developing} developing`,
      cls: '',
    });
  }

  const bars: BarView[] = dims
    .map((d) => ({
      id: d.dimension_id,
      label: d.dimension_name.replace(' / Root-Cause Diagnosis', ''),
      sub: admin ? `${d.items_scored} of 5 scenarios scored` : `${d.items_scored} of 5 scenarios ranked`,
      score: d.score_0_to_3,
      pct: d.score_0_to_3 === null ? 0 : (d.score_0_to_3 / 3) * 100,
      band: d.band,
      avg: cohortDims?.[d.dimension_id] ?? null,
    }))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  const ordered = [byId.get('equity')!, ...dims.filter((d) => d.dimension_id !== 'equity')].filter(Boolean);
  const dimRows: DimRowView[] = ordered.map((d) => {
    const meta = dimById(d.dimension_id)!;
    return {
      id: d.dimension_id, name: d.dimension_name, short: meta.short, blurb: meta.blurb, gate: meta.gate,
      band: d.band, bandLabel: d.band ? BANDS[d.band].label : 'Not yet assessed',
      note: d.coaching_note, action: d.action,
      adminNums: admin
        ? {
            score: d.score_0_to_3 === null ? null : fmt(d.score_0_to_3),
            detail: d.band ? `of 3.00 · ${BANDS[d.band].label} band (${BANDS[d.band].range})` : 'No score — dimension not assessed',
            items: `${d.items_scored} item${d.items_scored === 1 ? '' : 's'} scored`,
          }
        : null,
    };
  });

  const recIds: DimensionId[] = [];
  for (const id of [...profile.growth, ...profile.strengths.slice(0, 1)]) if (!recIds.includes(id)) recIds.push(id);
  const programmes = recIds.map((id) => ({ ...PROGRAMMES[id], id, dimShort: shortDim(dimById(id)!.name) }));

  const pills = [`${bandLabel} band`];
  if (profile.department) pills.push(profile.department);
  if (admin) pills.push(profile.teacher_id);
  if (profile.assessed_at) pills.push('Assessed ' + formatDate(profile.assessed_at));
  else if (profile.preview) pills.push('In progress');

  return {
    role, admin,
    preview: profile.preview,
    previewBanner: profile.preview ? COPY.livePreview(profile.items_answered) : null,
    name: profile.teacher_name,
    pills,
    equityPill: profile.equity_gate,
    index,
    indexLine: 'Teaching practice index · ' + (index ? index.label : 'not yet assessed'),
    frame: index ? index.frame : COPY.notYet[role],
    kpis,
    readout: admin,
    validity: admin && profile.validity_flag ? { reasons: profile.validity_reasons ?? [] } : null,
    radar: DIMENSIONS.map((m) => ({ id: m.id, short: m.short, score: byId.get(m.id)?.score_0_to_3 ?? null, avg: cohortDims?.[m.id] ?? null })),
    radarNote: COPY.radarNote[role],
    bars,
    barsTitle: COPY.barsTitle[role],
    barsNote: COPY.barsNote[role],
    distribution: counts,
    equityGate: profile.equity_gate && eq ? { note: eq.coaching_note, action: eq.action, body: COPY.equityGateBody[role] } : null,
    showAreas: scored.length >= 2,
    strengths,
    growth,
    insights: profile.insights,
    cohort: admin && cohort
      ? {
          n: cohort.n,
          available: cohort.available,
          rows: dims.map((d) => {
            const avg = cohortDims?.[d.dimension_id] ?? null;
            const mine = d.score_0_to_3;
            return { id: d.dimension_id, name: d.dimension_name, mine, avg, diff: mine === null || avg === null ? null : Math.round((mine - avg) * 100) / 100, band: d.band };
          }),
        }
      : null,
    dimRows,
    programmes,
    path: profile.path,
    footNote: COPY.footNote[role],
    itemLevel: admin ? profile.item_level ?? [] : null,
    copy: {
      subtitle: COPY.reportSubtitle[role], insightsDesc: COPY.insightsDesc[role], recommended: COPY.recommended[role],
      pathTitle: COPY.pathTitle[role], profileTitle: COPY.profileTitle[role], profileDesc: COPY.profileDesc[role],
    },
  };
}

export { BAND_TEXT };
