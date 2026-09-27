/* In-memory repository for local development and tests.
   Mirrors the Postgres repository's scoping: every read filters by institution. */
import type { Cycle } from '../access';
import type { AnswerRow, AttemptRow, AuditEntry, InstitutionRepo, ItemRow, ProfileRow, Repo } from './types';

interface State {
  items: ItemRow[];
  cycles: Cycle[];
  attempts: AttemptRow[];
  answers: Map<string, Map<string, AnswerRow>>;
  profiles: Map<string, ProfileRow>;
  audit: (AuditEntry & { institution_id: string; at: Date })[];
}

const clone = <T>(v: T): T => structuredClone(v);

export class MemoryRepo implements Repo {
  readonly state: State;

  constructor(seed: { items: ItemRow[]; cycles?: Cycle[] }) {
    this.state = {
      items: seed.items.map(clone), cycles: (seed.cycles ?? []).map(clone),
      attempts: [], answers: new Map(), profiles: new Map(), audit: [],
    };
  }

  async listItems(filter: { band?: string; dimension?: string; activeOnly?: boolean } = {}) {
    return this.state.items
      .filter((i) => (!filter.band || i.grade_band === filter.band) && (!filter.dimension || i.dimension === filter.dimension) && (!filter.activeOnly || i.active))
      .map(clone);
  }

  async getItems(ids: string[]) {
    const by = new Map(this.state.items.map((i) => [i.item_id, i]));
    return ids.map((id) => by.get(id)).filter((i): i is ItemRow => !!i).map(clone);
  }

  addCycle(c: Cycle) { this.state.cycles.push(clone(c)); }

  forInstitution(institutionId: string): InstitutionRepo {
    const s = this.state;
    const own = (a: AttemptRow | undefined) => (a && a.institution_id === institutionId ? a : undefined);
    const attempt = (id: string) => own(s.attempts.find((a) => a.attempt_id === id));
    return {
      async listCycles() { return s.cycles.filter((c) => c.institution_id === institutionId).map(clone); },
      async findAttempt(teacherId, cycleId) {
        return clone(s.attempts.find((a) => a.institution_id === institutionId && a.teacher_id === teacherId && a.cycle_id === cycleId) ?? null);
      },
      async getAttempt(id) { return clone(attempt(id) ?? null); },
      async createAttempt(row) {
        if (row.institution_id !== institutionId) throw new Error('institution mismatch');
        if (s.attempts.some((a) => a.teacher_id === row.teacher_id && a.cycle_id === row.cycle_id)) throw new Error('duplicate attempt');
        s.attempts.push(clone(row));
        return clone(row);
      },
      async resetAttempt(id, patch) {
        const a = attempt(id);
        if (!a) throw new Error('not found');
        Object.assign(a, patch);
        s.answers.delete(id);
        return clone(a);
      },
      async getAnswers(id) {
        if (!attempt(id)) return [];
        return [...(s.answers.get(id)?.values() ?? [])].map(clone);
      },
      async upsertAnswer(id, itemId, a, at) {
        if (!attempt(id)) throw new Error('not found');
        const m = s.answers.get(id) ?? new Map<string, AnswerRow>();
        s.answers.set(id, m);
        const prev = m.get(itemId);
        const row: AnswerRow = { item_id: itemId, ranked: a.ranked, note: a.note, flagged: a.flagged, ms_on_item: Math.max(prev?.ms_on_item ?? 0, a.ms_on_item), updated_at: at };
        m.set(itemId, row);
        return clone(row);
      },
      async submit(id, profile, at) {
        const a = attempt(id);
        if (!a || a.status !== 'in_progress') return false;
        a.status = 'submitted';
        a.submitted_at = at;
        s.profiles.set(id, clone(profile));
        return true;
      },
      async getProfile(id) { return attempt(id) ? clone(s.profiles.get(id) ?? null) : null; },
      async latestSubmittedAttempt(teacherId) {
        const rows = s.attempts
          .filter((a) => a.institution_id === institutionId && a.teacher_id === teacherId && a.status === 'submitted')
          .sort((x, y) => (y.submitted_at?.getTime() ?? 0) - (x.submitted_at?.getTime() ?? 0));
        return clone(rows[0] ?? null);
      },
      async listAttempts() { return s.attempts.filter((a) => a.institution_id === institutionId).map(clone); },
      async listSubmittedProfiles() {
        return s.attempts
          .filter((a) => a.institution_id === institutionId && a.status === 'submitted' && s.profiles.has(a.attempt_id))
          .map((a) => ({ attempt: clone(a), profile: clone(s.profiles.get(a.attempt_id)!) }));
      },
      async answerCounts(ids) {
        const out: Record<string, number> = {};
        for (const id of ids) {
          if (!attempt(id)) continue;
          out[id] = [...(s.answers.get(id)?.values() ?? [])].filter((r) => r.ranked.every(Boolean)).length;
        }
        return out;
      },
      async audit(entry, at) { s.audit.push({ ...entry, institution_id: institutionId, at }); },
    };
  }
}
