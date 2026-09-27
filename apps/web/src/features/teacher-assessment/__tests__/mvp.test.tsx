/* MVP mode (the default build): no sign-in, backend runs in the browser. */
import { screen } from '@testing-library/react';
import { Route } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { resetMvpData } from '../api/localBackend';
import { RequireModuleAccess } from '../guards/RequireModuleAccess';
import { renderAt } from './helpers';

beforeEach(() => { localStorage.clear(); resetMvpData(); });
afterEach(() => vi.unstubAllGlobals());

describe('MVP mode', () => {
  it('opens teacher and admin routes with no sign-in and no network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    renderAt('/teacher-assessment', <>
      <Route path="/teacher-assessment" element={<RequireModuleAccess mode="teacher"><p>TEACHER CONTENT</p></RequireModuleAccess>} />
    </>);
    expect(await screen.findByText('TEACHER CONTENT')).toBeInTheDocument();
    renderAt('/a', <Route path="/a" element={<RequireModuleAccess mode="admin"><p>ADMIN CONTENT</p></RequireModuleAccess>} />);
    expect(await screen.findByText('ADMIN CONTENT')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('runs the full journey in the browser and persists it on the device', async () => {
    expect(await api.access()).toMatchObject({ can_take: true, can_manage: true });
    expect(await api.currentAttempt()).toBeNull();
    const a = await api.startAttempt('Primary (1-5)');
    expect(a.items).toHaveLength(35);
    expect(JSON.stringify(a)).not.toMatch(/key_rank|rationale/);
    await expect(api.submit(a.attempt_id)).rejects.toMatchObject({ status: 422 });
    const pats = [['B', 'A', 'C', 'D'], ['A', 'C', 'B', 'D'], ['D', 'A', 'B', 'C'], ['C', 'B', 'A', 'D']];
    for (const [n, it] of a.items.entries()) await api.putAnswer(a.attempt_id, it.item_id, { ranked: pats[n % 4], ms: 20000 });
    expect((await api.preview()).preview).toBe(true);
    const p = await api.submit(a.attempt_id);
    expect(p).toMatchObject({ teacher_name: 'Guest teacher', items_answered: 35, scoring_version: 'v1' });

    // Survives a reload (new backend instance reading localStorage).
    resetMvpDataKeepStorage();
    expect((await api.myProfile()).index).toBe(p.index);
    const roster = await api.adminTeachers();
    expect(roster.map((r) => r.teacher_id)).toContain('mvp-teacher');
    expect(roster.length).toBe(12);
    expect((await api.adminCohort()).available).toBe(true);
    expect((await api.adminTeacherProfile('mvp-teacher')).item_level).toHaveLength(35);

    // Reset wipes the device data.
    resetMvpData();
    expect(await api.currentAttempt()).toBeNull();
  });
});

/** Drop the in-memory backend but keep localStorage, as a page reload would. */
function resetMvpDataKeepStorage() {
  const saved = localStorage.getItem('thisai-ta-mvp-v1');
  resetMvpData();
  if (saved) localStorage.setItem('thisai-ta-mvp-v1', saved);
}
