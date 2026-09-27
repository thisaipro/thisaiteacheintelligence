/* API contracts shared by apps/api and the thisai_fe feature folder.
   Nothing in here carries key_rank, points or rationale for an item. */
import type { Band, DimensionId, IndexBandId } from './catalogue';

export type ViewerRole = 'teacher' | 'admin';

/** Shape of the existing thisai.pro GET /api/me response. */
export interface Me {
  user_id: string;
  role: string; // 'teacher' | 'institution_admin' | 'student' | 'parent' | ...
  institution_id: string | null;
  name: string;
  email?: string;
  institution_name?: string | null;
  department?: string | null;
}

export type DenialReason = 'NOT_TEACHER' | 'NO_INSTITUTION' | 'MODULE_DISABLED' | 'CYCLE_CLOSED';
/** Client-only reason for a teacher opening an admin route. */
export type ClientDenialReason = DenialReason | 'NOT_ADMIN';

export interface AccessResponse {
  can_take: boolean;
  can_manage: boolean;
  reason: DenialReason | null;
  cycle_id: string | null;
  cycle_name: string | null;
  /** Teacher has a submitted profile they can still read (e.g. after the cycle closes). */
  has_profile: boolean;
}

export interface ClientOption { label: string; text: string }
/** An item as served to the teacher: options already in display order, relabelled A–D by position. */
export interface ClientItem {
  item_id: string;
  grade_band: string;
  dimension: string;
  dimension_id: DimensionId;
  gate_dimension: boolean;
  scenario: string;
  options: ClientOption[];
}

export type Ranked = (string | null)[]; // length 4, client labels, null = empty slot

export interface AnswerDTO {
  item_id: string;
  ranked: Ranked;
  note: string;
  flagged: boolean;
  ms_on_item: number;
  updated_at: string | null;
}

export interface AnswerPut { ranked: Ranked; note?: string; flagged?: boolean; ms?: number }

export type AttemptStatus = 'in_progress' | 'submitted';
export interface AttemptDTO {
  attempt_id: string;
  cycle_id: string;
  grade_band: string;
  status: AttemptStatus;
  started_at: string;
  submitted_at: string | null;
  items: ClientItem[];
  answers: Record<string, AnswerDTO>;
}

export interface DimensionResult {
  dimension_id: DimensionId;
  dimension_name: string;
  band: Band | null;
  score_0_to_3: number | null;
  items_scored: number;
  /** null in the live preview: notes quote the framework's keyed response. */
  coaching_note: string | null;
  action: string;
}

export interface Insight { ic: string; text: string }
export interface PathStep { wk: string; t: string; d: string }

export interface ItemLevelRow {
  item_id: string;
  dimension: string;
  ranked: string[];
  key: string[];
  score: number | null;
  source: string;
  note: string;
  ms_on_item: number;
}

export interface ProfileDTO {
  attempt_id: string | null;
  teacher_id: string;
  teacher_name: string;
  institution_name: string | null;
  department: string | null;
  grade_band: string;
  assessed_at: string | null;
  index: number | null;
  index_mean: number | null;
  index_band: IndexBandId | null;
  dims: DimensionResult[];
  equity_gate: boolean;
  strengths: DimensionId[];
  growth: DimensionId[];
  insights: Insight[];
  path: PathStep[];
  scoring_version: string;
  items_answered: number;
  items_total: number;
  preview: boolean;
  /** Admin view only. */
  validity_flag?: boolean;
  validity_reasons?: string[];
  item_level?: ItemLevelRow[];
}

export interface RosterRow {
  teacher_id: string;
  teacher_name: string;
  department: string | null;
  grade_band: string;
  status: AttemptStatus;
  attempt_id: string;
  index: number | null;
  index_band: IndexBandId | null;
  equity_gate: boolean | null;
  validity_flag: boolean | null;
  dim_bands: Partial<Record<DimensionId, Band | null>>;
  items_answered: number;
  submitted_at: string | null;
  started_at: string;
}

export interface CohortDTO {
  n: number;
  min_n: number;
  available: boolean;
  /** Present only when available (n >= min_n). */
  dims: Partial<Record<DimensionId, number | null>> | null;
}

export interface BankOption { label: string; text: string; key_rank: number; points: number; rationale: string }
export interface BankItem {
  item_id: string;
  grade_band: string;
  dimension: string;
  gate_dimension: boolean;
  scenario: string;
  options: BankOption[];
  source_tag: string;
  version: number;
  active: boolean;
}

export interface ApiError { error: string; reason?: string; message?: string }
