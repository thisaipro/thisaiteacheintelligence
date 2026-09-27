/* Maps server rows to client DTOs. The only place bank labels are translated
   to display labels: the client sees options relabelled A–D by display position,
   because bank labels follow the keyed order (A = key 1 … D = key 4). */
import {
  dimByName, type AnswerDTO, type ClientItem, type ItemLevelRow, type ProfileDTO, type Ranked, type ViewerRole,
} from '@thisai/ta-shared';
import { dimsForRole, indexFor, scoreItem, shuffledOptions, type ScoredProfile } from './scoring/v1';
import type { AnswerRow, AttemptRow, ItemRow, ProfileRow } from './repo/types';

const DISPLAY = ['A', 'B', 'C', 'D'];

export class Presenter {
  constructor(private salt = '') {}

  /** Bank labels in display order. */
  displayOrder = (item: { item_id: string; options: { label: string; key_rank: number }[] }) =>
    shuffledOptions(item, this.salt).map((o) => o.label);

  toClientItem(item: ItemRow): ClientItem {
    const opts = shuffledOptions(item, this.salt);
    return {
      item_id: item.item_id,
      grade_band: item.grade_band,
      dimension: item.dimension,
      dimension_id: dimByName(item.dimension)!.id,
      gate_dimension: item.gate_dimension,
      scenario: item.scenario,
      options: opts.map((o, i) => ({ label: DISPLAY[i], text: o.text })),
    };
  }

  /** Display labels → bank labels. Throws on unknown or duplicate labels. */
  toBank(item: ItemRow, ranked: Ranked): (string | null)[] {
    const order = this.displayOrder(item);
    const seen = new Set<string>();
    return ranked.map((l) => {
      if (l === null) return null;
      const i = DISPLAY.indexOf(l);
      if (i < 0) throw new Error(`Unknown option ${l}`);
      if (seen.has(l)) throw new Error(`Option ${l} placed twice`);
      seen.add(l);
      return order[i];
    });
  }

  toClient(item: ItemRow, ranked: (string | null)[]): Ranked {
    const order = this.displayOrder(item);
    return ranked.map((l) => (l === null ? null : DISPLAY[order.indexOf(l)]));
  }

  toAnswerDTO(item: ItemRow, a: AnswerRow): AnswerDTO {
    return {
      item_id: a.item_id, ranked: this.toClient(item, a.ranked), note: a.note, flagged: a.flagged,
      ms_on_item: a.ms_on_item, updated_at: a.updated_at.toISOString(),
    };
  }
}

export function profileRowFrom(attemptId: string, p: ScoredProfile, at: Date): ProfileRow {
  return {
    attempt_id: attemptId, index: p.index, index_band: p.index_band, dims: p.dims, equity_gate: p.equity_gate,
    validity_flag: p.validity.flag, validity_reasons: p.validity.reasons, insights: p.insights, path: p.path,
    strengths: p.strengths, growth: p.growth, scoring_version: p.scoring_version, created_at: at,
  };
}

interface Who { attempt: AttemptRow; institution_name: string | null }

export function toProfileDTO(
  { attempt, institution_name }: Who,
  p: ProfileRow | (ScoredProfile & { validity_flag?: boolean; validity_reasons?: string[] }),
  role: ViewerRole,
  extra: { preview?: boolean; items_answered: number; items_total: number; item_level?: ItemLevelRow[] },
): ProfileDTO {
  const preview = !!extra.preview;
  const dto: ProfileDTO = {
    attempt_id: attempt.attempt_id,
    teacher_id: attempt.teacher_id,
    teacher_name: attempt.teacher_name,
    institution_name,
    department: attempt.department,
    grade_band: attempt.grade_band,
    assessed_at: attempt.submitted_at?.toISOString() ?? null,
    index: p.index,
    index_mean: indexFor(p.dims)?.mean ?? null,
    index_band: p.index_band,
    dims: dimsForRole(p.dims, role, !preview),
    equity_gate: p.equity_gate,
    strengths: p.strengths,
    growth: p.growth,
    insights: p.insights[role],
    path: p.path[role],
    scoring_version: p.scoring_version,
    items_answered: extra.items_answered,
    items_total: extra.items_total,
    preview,
  };
  if (role === 'admin') {
    dto.validity_flag = 'validity' in p ? p.validity.flag : p.validity_flag;
    dto.validity_reasons = 'validity' in p ? p.validity.reasons : p.validity_reasons;
    if (extra.item_level) dto.item_level = extra.item_level;
  }
  return dto;
}

export function itemLevelRows(items: ItemRow[], answers: AnswerRow[]): ItemLevelRow[] {
  const by = new Map(answers.map((a) => [a.item_id, a]));
  return items
    .filter((i) => by.has(i.item_id))
    .map((i) => {
      const a = by.get(i.item_id)!;
      return {
        item_id: i.item_id,
        dimension: i.dimension,
        ranked: a.ranked.map((l) => l ?? '–'),
        key: i.options.slice().sort((x, y) => x.key_rank - y.key_rank).map((o) => o.label),
        score: scoreItem(i, a.ranked),
        source: i.source_tag,
        note: a.note,
        ms_on_item: a.ms_on_item,
      };
    });
}
