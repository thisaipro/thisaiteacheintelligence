import type { DimensionId, IndexBandId, Insight, PathStep, ViewerRole } from '@thisai/ta-shared';
import type { Cycle } from '../access';
import type { DimScore, ScoringItem } from '../scoring/v1';

export interface ItemRow extends ScoringItem {
  gate_dimension: boolean;
  source_tag: string;
  version: number;
  active: boolean;
  options: { label: string; text: string; key_rank: number; points: number; rationale: string }[];
}

export interface AttemptRow {
  attempt_id: string;
  teacher_id: string;
  institution_id: string;
  cycle_id: string;
  grade_band: string;
  started_at: Date;
  submitted_at: Date | null;
  status: 'in_progress' | 'submitted';
  item_order: string[];
  teacher_name: string;
  department: string | null;
}

/** `ranked` is stored in BANK labels. */
export interface AnswerRow {
  item_id: string;
  ranked: (string | null)[];
  note: string;
  flagged: boolean;
  updated_at: Date;
  ms_on_item: number;
}

export interface ProfileRow {
  attempt_id: string;
  index: number | null;
  index_band: IndexBandId | null;
  dims: DimScore[];
  equity_gate: boolean;
  validity_flag: boolean;
  validity_reasons: string[];
  insights: Record<ViewerRole, Insight[]>;
  path: Record<ViewerRole, PathStep[]>;
  strengths: DimensionId[];
  growth: DimensionId[];
  scoring_version: string;
  created_at: Date;
}

export interface AuditEntry {
  actor_id: string;
  action: string;
  target_teacher_id?: string | null;
  attempt_id?: string | null;
}

/** Global, non-institution content. */
export interface ItemStore {
  listItems(filter?: { band?: string; dimension?: string; activeOnly?: boolean }): Promise<ItemRow[]>;
  getItems(ids: string[]): Promise<ItemRow[]>;
}

/** Every method here is scoped to one institution (query guard + RLS in Postgres). */
export interface InstitutionRepo {
  listCycles(): Promise<Cycle[]>;
  findAttempt(teacherId: string, cycleId: string): Promise<AttemptRow | null>;
  getAttempt(attemptId: string): Promise<AttemptRow | null>;
  createAttempt(row: AttemptRow): Promise<AttemptRow>;
  resetAttempt(attemptId: string, patch: Pick<AttemptRow, 'grade_band' | 'item_order' | 'started_at'>): Promise<AttemptRow>;
  getAnswers(attemptId: string): Promise<AnswerRow[]>;
  upsertAnswer(attemptId: string, itemId: string, a: Omit<AnswerRow, 'item_id' | 'updated_at'>, at: Date): Promise<AnswerRow>;
  /** Stores the profile and locks the attempt. Returns false if it was not in progress. */
  submit(attemptId: string, profile: ProfileRow, at: Date): Promise<boolean>;
  getProfile(attemptId: string): Promise<ProfileRow | null>;
  latestSubmittedAttempt(teacherId: string): Promise<AttemptRow | null>;
  listAttempts(): Promise<AttemptRow[]>;
  listSubmittedProfiles(): Promise<{ attempt: AttemptRow; profile: ProfileRow }[]>;
  answerCounts(attemptIds: string[]): Promise<Record<string, number>>;
  audit(entry: AuditEntry, at: Date): Promise<void>;
}

export interface Repo extends ItemStore {
  forInstitution(institutionId: string): InstitutionRepo;
}
