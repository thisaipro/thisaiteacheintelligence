export {
  BANDS, BAND_ORDER, DIMENSIONS, GRADE_BANDS, INDEX_BANDS, ITEMS_PER_ATTEMPT, PROGRAMMES,
  dimById, dimByName, gradeBandLabel, indexBandFor,
  type Band, type DimensionId, type DimensionMeta, type GradeBandMeta, type Programme,
} from '@thisai/ta-shared';
import type { Band } from '@thisai/ta-shared';

/** Fill colours (bars, dots, dials) — the three semantic band colours. */
export const BAND_FILL: Record<Band, string> = { developing: 'var(--developing)', consistent: 'var(--consistent)', strong: 'var(--strong)' };
/** Text colours — same hue, AA contrast. */
export const BAND_TEXT: Record<Band, string> = { developing: 'var(--developing-t)', consistent: 'var(--consistent-t)', strong: 'var(--strong-t)' };
export const BAND_HEX: Record<Band, string> = { developing: '#b57c12', consistent: '#3f5fae', strong: '#2f8a52' };
export const DOT_HEX: Record<Band, string> = { developing: '#eec577', consistent: '#9fb2dd', strong: '#96ceab' };
export const KPI_CLASS: Record<Band, string> = { strong: 'good', consistent: 'mid', developing: 'warn' };

export const RANK_LABELS = [
  { n: '1', l: "Closest to what I'd do" },
  { n: '2', l: 'Second' },
  { n: '3', l: 'Third' },
  { n: '4', l: 'Least like me' },
];

export const isRanked = (r: (string | null)[] | undefined) => !!r && r.length === 4 && r.every(Boolean);
