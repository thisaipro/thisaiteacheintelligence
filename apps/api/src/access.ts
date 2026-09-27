/* Access rules for Teacher Intelligence · Assessment. Pure — the caller
   supplies the resolved identity, the institution's cycles and the clock.

   take   = role 'teacher' AND institution AND module enabled AND a cycle open
   manage = role 'institution_admin' AND institution (admins never take the test) */
import type { AccessResponse, DenialReason, Me } from '@thisai/ta-shared';

export interface Cycle {
  cycle_id: string;
  institution_id: string;
  name: string;
  opens_at: Date;
  closes_at: Date;
  enabled: boolean;
}

export const TEACHER_ROLES = new Set(['teacher']);
export const ADMIN_ROLES = new Set(['institution_admin']);

export interface AccessDecision extends AccessResponse {
  /** The open cycle (teacher) or the most recent enabled cycle (admin / closed). */
  cycle: Cycle | null;
}

export function resolveAccess(
  me: Me,
  cycles: Cycle[],
  now: Date,
  opts: { moduleEnabled?: boolean; hasProfile?: boolean } = {},
): AccessDecision {
  const moduleEnabled = opts.moduleEnabled ?? true;
  const deny = (reason: DenialReason, cycle: Cycle | null = null, can_manage = false): AccessDecision => ({
    can_take: false, can_manage, reason, cycle_id: cycle?.cycle_id ?? null, cycle_name: cycle?.name ?? null,
    has_profile: !!opts.hasProfile, cycle,
  });

  const isTeacher = TEACHER_ROLES.has(me.role);
  const isAdmin = ADMIN_ROLES.has(me.role);
  if (!isTeacher && !isAdmin) return deny('NOT_TEACHER');
  if (!me.institution_id) return deny('NO_INSTITUTION');

  const mine = cycles.filter((c) => c.institution_id === me.institution_id && c.enabled);
  const latest = mine.slice().sort((a, b) => b.opens_at.getTime() - a.opens_at.getTime())[0] ?? null;

  if (isAdmin) {
    // Admins manage whatever the cycle state; the global kill-switch still applies.
    if (!moduleEnabled || !latest) return { ...deny('MODULE_DISABLED', latest), can_manage: false };
    return { can_take: false, can_manage: true, reason: null, cycle_id: latest.cycle_id, cycle_name: latest.name, has_profile: false, cycle: latest };
  }

  if (!moduleEnabled || !mine.length) return deny('MODULE_DISABLED');
  const open = mine
    .filter((c) => c.opens_at.getTime() <= now.getTime() && now.getTime() < c.closes_at.getTime())
    .sort((a, b) => b.opens_at.getTime() - a.opens_at.getTime())[0];
  if (!open) return deny('CYCLE_CLOSED', latest);
  return { can_take: true, can_manage: false, reason: null, cycle_id: open.cycle_id, cycle_name: open.name, has_profile: !!opts.hasProfile, cycle: open };
}
