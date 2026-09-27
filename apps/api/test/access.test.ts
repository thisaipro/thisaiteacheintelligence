import { describe, expect, it } from 'vitest';
import type { Me } from '@thisai/ta-shared';
import { resolveAccess, type Cycle } from '../src/access';

const now = new Date('2026-09-27T10:00:00Z');
const day = 86400000;
const open: Cycle = { cycle_id: 'c2', institution_id: 'i1', name: 'Cycle 2', opens_at: new Date(now.getTime() - day), closes_at: new Date(now.getTime() + day), enabled: true };
const closed: Cycle = { ...open, cycle_id: 'c1', name: 'Cycle 1', opens_at: new Date(now.getTime() - 30 * day), closes_at: new Date(now.getTime() - 10 * day) };
const disabled: Cycle = { ...open, cycle_id: 'c3', enabled: false };
const me = (p: Partial<Me>): Me => ({ user_id: 'u1', role: 'teacher', name: 'T', institution_id: 'i1', ...p });

describe('resolveAccess', () => {
  it('teacher + institution + enabled + open cycle → can_take', () => {
    const a = resolveAccess(me({}), [closed, open], now);
    expect(a).toMatchObject({ can_take: true, can_manage: false, reason: null, cycle_id: 'c2' });
  });
  it('NOT_TEACHER for students and parents', () => {
    expect(resolveAccess(me({ role: 'student' }), [open], now).reason).toBe('NOT_TEACHER');
    expect(resolveAccess(me({ role: 'parent' }), [open], now).reason).toBe('NOT_TEACHER');
  });
  it('NO_INSTITUTION for a teacher without an institution', () => {
    expect(resolveAccess(me({ institution_id: null }), [open], now)).toMatchObject({ can_take: false, reason: 'NO_INSTITUTION' });
  });
  it('MODULE_DISABLED when no enabled cycle or the kill-switch is off', () => {
    expect(resolveAccess(me({}), [disabled], now).reason).toBe('MODULE_DISABLED');
    expect(resolveAccess(me({}), [], now).reason).toBe('MODULE_DISABLED');
    expect(resolveAccess(me({}), [open], now, { moduleEnabled: false }).reason).toBe('MODULE_DISABLED');
  });
  it('MODULE_DISABLED ignores cycles from other institutions', () => {
    expect(resolveAccess(me({}), [{ ...open, institution_id: 'other' }], now).reason).toBe('MODULE_DISABLED');
  });
  it('CYCLE_CLOSED when enabled but none open', () => {
    const a = resolveAccess(me({}), [closed], now, { hasProfile: true });
    expect(a).toMatchObject({ can_take: false, reason: 'CYCLE_CLOSED', cycle_id: 'c1', has_profile: true });
    // closes_at is exclusive
    expect(resolveAccess(me({}), [{ ...open, closes_at: now }], now).reason).toBe('CYCLE_CLOSED');
  });
  it('institution admin → can_manage, never can_take', () => {
    const a = resolveAccess(me({ role: 'institution_admin' }), [closed], now);
    expect(a).toMatchObject({ can_take: false, can_manage: true, reason: null });
  });
  it('institution admin without institution → NO_INSTITUTION', () => {
    expect(resolveAccess(me({ role: 'institution_admin', institution_id: null }), [open], now)).toMatchObject({ can_manage: false, reason: 'NO_INSTITUTION' });
  });
});
