import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route } from 'react-router-dom';
import { RequireModuleAccess } from '../guards/RequireModuleAccess';
import { ADMIN, TEACHER, allowManage, allowTake, deny, mockFetch, renderAt } from './helpers';

afterEach(() => vi.unstubAllGlobals());

const routes = (
  <>
    <Route path="/teacher-assessment" element={<RequireModuleAccess mode="teacher"><p>TEACHER CONTENT</p></RequireModuleAccess>} />
    <Route path="/teacher-assessment/profile" element={<RequireModuleAccess mode="teacher" allowClosedCycle><p>PROFILE CONTENT</p></RequireModuleAccess>} />
    <Route path="/teacher-assessment/admin/bank" element={<RequireModuleAccess mode="admin"><p>ADMIN CONTENT</p></RequireModuleAccess>} />
  </>
);

function setup(me: object | null, access: object) {
  return mockFetch((url) => {
    if (url === '/api/me') return me ? { body: me } : { status: 401, body: { error: 'unauthenticated' } };
    if (url.endsWith('/access')) return { body: access };
  });
}

describe('RequireModuleAccess', () => {
  it('shows the 4-step access check while loading, then the teacher content', async () => {
    setup(TEACHER, allowTake);
    renderAt('/teacher-assessment', routes);
    expect(screen.getByRole('heading', { name: 'Checking your access' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((li) => li.querySelector('b')?.textContent)).toEqual([
      'Thisai account', 'Institution', 'Role on record', 'Teacher Assessment access',
    ]);
    expect(await screen.findByText('TEACHER CONTENT')).toBeInTheDocument();
  });

  it.each([
    ['NOT_TEACHER', { ...TEACHER, role: 'student' }, "Teacher Assessment isn't available for this account", ['ok', 'ok', 'no', 'no']],
    ['NO_INSTITUTION', { ...TEACHER, institution_id: null, institution_name: null }, "Teacher Assessment isn't available for this account", ['ok', 'no', 'ok', 'no']],
    ['MODULE_DISABLED', TEACHER, "Teacher Assessment isn't switched on yet", ['ok', 'ok', 'ok', 'no']],
    ['CYCLE_CLOSED', TEACHER, 'The current assessment cycle is closed', ['ok', 'ok', 'ok', 'no']],
  ])('%s → AccessDenied with ✓/✕ per step and a link to thisai.pro', async (reason, me, title, states) => {
    setup(me, deny(reason));
    renderAt('/teacher-assessment', routes);
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    const main = document.querySelector('main.denied')!;
    expect(main.getAttribute('data-reason')).toBe(reason);
    expect([...main.querySelectorAll('.chk')].map((c) => c.getAttribute('data-state'))).toEqual(states);
    expect(screen.getByRole('link', { name: 'Go to thisai.pro' })).toHaveAttribute('href', 'https://thisai.pro');
    expect(screen.queryByText('TEACHER CONTENT')).not.toBeInTheDocument();
  });

  it('admin on a teacher route → "Admins manage, teachers take" with a button to the bank', async () => {
    setup(ADMIN, allowManage);
    renderAt('/teacher-assessment', routes);
    expect(await screen.findByRole('heading', { name: 'Admins manage, teachers take' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to question bank' })).toBeInTheDocument();
    expect(screen.queryByText('TEACHER CONTENT')).not.toBeInTheDocument();
  });

  it('admin on an admin route → content', async () => {
    setup(ADMIN, allowManage);
    renderAt('/teacher-assessment/admin/bank', routes);
    expect(await screen.findByText('ADMIN CONTENT')).toBeInTheDocument();
  });

  it('teacher on an admin route → NOT_ADMIN', async () => {
    setup(TEACHER, allowTake);
    renderAt('/teacher-assessment/admin/bank', routes);
    expect(await screen.findByRole('heading', { name: 'This page is for institution admins' })).toBeInTheDocument();
    expect(screen.queryByText('ADMIN CONTENT')).not.toBeInTheDocument();
  });

  it('closed cycle still lets a teacher read an existing profile', async () => {
    setup(TEACHER, deny('CYCLE_CLOSED', true));
    renderAt('/teacher-assessment/profile', routes);
    expect(await screen.findByText('PROFILE CONTENT')).toBeInTheDocument();
  });

  it('signed out → sign in with the existing thisai.pro account (no local login form)', async () => {
    setup(null, allowTake);
    renderAt('/teacher-assessment', routes);
    expect(await screen.findByRole('heading', { name: 'Sign in with your Thisai account' })).toBeInTheDocument();
    expect(document.querySelector('input[type=password]')).toBeNull();
  });
});
