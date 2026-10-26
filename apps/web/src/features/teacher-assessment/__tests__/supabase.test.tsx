import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route } from 'react-router-dom';
import { RequireModuleAccess } from '../guards/RequireModuleAccess';
import { api } from '../api/client';
import { useCurrentAttempt } from '../api/queries';
import { outbox } from '../api/outbox';
import { fetchMe, SessionUnavailableError } from '../../../platform/session';
import { ADMIN, TEACHER, allowManage, allowTake, mockFetch, renderAt } from './helpers';

const auth = vi.hoisted(() => ({ getSession: vi.fn(), signInWithPassword: vi.fn() }));
vi.mock('../../../platform/supabase', async (original) => ({
  ...await original<typeof import('../../../platform/supabase')>(),
  getSupabase: () => ({ auth }),
  sessionHeaders: async () => {
    const { data } = await auth.getSession();
    return data.session ? { authorization: `Bearer ${data.session.access_token}` } : {};
  },
}));

const routes = <>
  <Route path="/teacher-assessment" element={<RequireModuleAccess mode="teacher"><p>TEACHER CONTENT</p></RequireModuleAccess>} />
  <Route path="/teacher-assessment/admin/teachers" element={<RequireModuleAccess mode="admin"><p>ADMIN CONTENT</p></RequireModuleAccess>} />
</>;

beforeEach(() => {
  vi.stubEnv('VITE_TA_MODE', 'supabase');
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  vi.spyOn(outbox, 'entries').mockResolvedValue([]);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); vi.restoreAllMocks(); });

describe('Supabase sign-in and API transport', () => {
  it('shows email/password sign-in without requesting assessment data while signed out', async () => {
    const fetcher = mockFetch(() => undefined);
    renderAt('/teacher-assessment', routes);
    expect(await screen.findByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('shows a configuration message when public environment variables are missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    renderAt('/teacher-assessment', routes);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in is not configured');
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });

  it('reports invalid credentials and keeps the form usable', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: new Error('Invalid login credentials') });
    renderAt('/teacher-assessment', routes);
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText('Email'), 'teacher@example.com');
    await u.type(screen.getByLabelText('Password'), 'incorrect');
    await u.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials');
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'teacher@example.com', password: 'incorrect' });
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it.each([[TEACHER, allowTake, 'TEACHER CONTENT'], [ADMIN, allowManage, 'ADMIN CONTENT']])('uses the verified identity and routes the account correctly', async (me, access, expected) => {
    auth.getSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null });
    const fetcher = mockFetch(() => ({ body: { me, access, attempt: null, profile: null, preview: null } }));
    renderAt('/teacher-assessment', routes);
    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe('/api/teacher-assessment/bootstrap');
    for (const [, options] of fetcher.mock.calls) expect(new Headers(options?.headers).get('authorization')).toBe('Bearer test-token');
  });

  it('never starts an HTTP assessment without a session', async () => {
    const fetcher = mockFetch(() => undefined);
    await expect(api.startAttempt('Pre-school')).rejects.toMatchObject({ status: 401 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('explains how to start the local API when Vite cannot reach it', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null });
    mockFetch(() => ({ status: 500, body: {} }));
    await expect(fetchMe()).rejects.toBeInstanceOf(SessionUnavailableError);
    await expect(fetchMe()).rejects.toThrow('npm run dev');
  });

  it('detects a static SPA response in place of the session API', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html></html>', { headers: { 'content-type': 'text/html' } })));
    await expect(fetchMe()).rejects.toBeInstanceOf(SessionUnavailableError);
  });

  it('explains that an Auth account still needs a teacher role and institution', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null });
    mockFetch(() => ({ body: { me: { ...TEACHER, role: 'unassigned', institution_id: null }, access: {}, attempt: null, profile: null, preview: null } }));
    renderAt('/teacher-assessment', routes);
    expect(await screen.findByRole('heading', { name: 'Your account needs assessment access' })).toBeInTheDocument();
    expect(screen.queryByText('TEACHER CONTENT')).not.toBeInTheDocument();
  });

  it('hydrates the attempt from bootstrap without fetching access or the attempt again', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null });
    const fetcher = mockFetch(() => ({ body: {
      me: TEACHER, access: allowTake,
      attempt: { attempt_id: 'own-attempt', status: 'in_progress', items: [{ item_id: 'I1' }], answers: {} },
      profile: null, preview: null,
    } }));
    function AttemptData() {
      const attempt = useCurrentAttempt();
      return <p>{attempt.data?.items.length} loaded items</p>;
    }
    renderAt('/teacher-assessment', <Route path="/teacher-assessment" element={<RequireModuleAccess mode="teacher"><AttemptData /></RequireModuleAccess>} />);
    expect(await screen.findByText('1 loaded items')).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite queued answers when revalidating a saved page', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null });
    vi.mocked(outbox.entries).mockResolvedValue([{ key: 'own-attempt|I1', attemptId: 'own-attempt', itemId: 'I1',
      body: { ranked: ['D', 'C', 'B', 'A'], note: 'Unsynced note' }, queuedAt: Date.now() }]);
    mockFetch(() => ({ body: { me: TEACHER, access: allowTake,
      attempt: { attempt_id: 'own-attempt', status: 'in_progress', items: [{ item_id: 'I1' }], answers: {} }, profile: null, preview: null,
    } }));
    function Rankings() { return <p>{useCurrentAttempt().data?.answers.I1?.ranked.join(',')}</p>; }
    renderAt('/teacher-assessment', <Route path="/teacher-assessment" element={<RequireModuleAccess mode="teacher"><Rankings /></RequireModuleAccess>} />);
    expect(await screen.findByText('D,C,B,A')).toBeInTheDocument();
  });
});
