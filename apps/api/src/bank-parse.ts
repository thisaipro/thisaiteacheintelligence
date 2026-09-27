/* Item bank validation — browser-safe (no fs). */
import { z } from 'zod';
import { DIMENSION_NAMES, GRADE_BAND_IDS } from '@thisai/ta-shared';
import type { ItemRow } from './repo/types';

const Option = z.object({
  label: z.enum(['A', 'B', 'C', 'D']),
  text: z.string().min(1),
  key_rank: z.number().int().min(1).max(4),
  points: z.number().int().min(0).max(3),
  rationale: z.string(),
});
const Item = z.object({
  item_id: z.string().min(1),
  grade_band: z.string().refine((b) => GRADE_BAND_IDS.includes(b), 'unknown grade band'),
  dimension: z.string().refine((d) => DIMENSION_NAMES.includes(d), 'unknown dimension'),
  gate_dimension: z.boolean(),
  scenario: z.string().min(1),
  options: z.array(Option).length(4)
    .refine((o) => new Set(o.map((x) => x.key_rank)).size === 4, 'key ranks must be 1–4, distinct')
    .refine((o) => new Set(o.map((x) => x.label)).size === 4, 'labels must be distinct'),
  source_tag: z.string().default(''),
});

export function parseBank(raw: unknown): ItemRow[] {
  const items = z.array(Item).parse(raw);
  const ids = new Set<string>();
  for (const i of items) {
    if (ids.has(i.item_id)) throw new Error(`Duplicate item_id ${i.item_id}`);
    ids.add(i.item_id);
  }
  return items.map((i) => ({ ...i, version: 1, active: true }));
}
