import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPageCache, persistPageCache, restorePageCache } from '../../../platform/pageCache';
import { RequireModuleAccess } from '../guards/RequireModuleAccess';
import { keys, useMyProfile } from '../api/queries';
import { outbox } from '../api/outbox';
import { TEACHER, allowTake } from './helpers';
import profile from './fixtures/profile.teacher.json';

vi.mock('../../../platform/supabase', () => ({
  supabaseConfigured: () => true,
  sessionHeaders: async () => ({ authorization: 'Bearer session-token' }),
  currentUserId: async () => 'TCH-0412',
}));

const project = 'https://project.supabase.co';
const createClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
const state = { me: TEACHER, access: { ...allowTake, has_profile: true }, attempt: null, profile, preview: null };

beforeEach(() => {
  sessionStorage.clear();
  vi.stubEnv('VITE_TA_MODE', 'supabase');
  vi.spyOn(outbox, 'entries').mockResolvedValue([]);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); sessionStorage.clear(); });

function savedClient() {
  const client = createClient();
  client.setQueryData(keys.me, state.me);
  client.setQueryData(keys.access, state.access);
  client.setQueryData(keys.attempt, state.attempt);
  client.setQueryData(keys.profile, profile);
  return client;
}

function save(client: QueryClient) {
  const stop = persistPageCache(client, project, TEACHER.user_id);
  window.dispatchEvent(new Event('pagehide'));
  stop();
}

function SavedReport() {
  const report = useMyProfile();
  return <p>{report.data ? 'SAVED REPORT' : 'WAITING FOR REPORT'}</p>;
}

function openReport(client: QueryClient) {
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/profile']}><Routes>
    <Route path="/profile" element={<RequireModuleAccess mode="teacher"><SavedReport /></RequireModuleAccess>} />
  </Routes></MemoryRouter></QueryClientProvider>);
}

describe('refreshing a signed-in page', () => {
  it('renders the saved report immediately while one bootstrap refresh runs in the background', async () => {
    save(savedClient());
    const client = createClient();
    expect(restorePageCache(client, project, TEACHER.user_id)).toBe(true);
    let finish!: (response: Response) => void;
    const fetcher = vi.fn((_input: RequestInfo | URL, _options?: RequestInit) => new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal('fetch', fetcher);
    openReport(client);
    expect(screen.getByText('SAVED REPORT')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Checking your access' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Loading assessment')).not.toBeInTheDocument();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    finish(new Response(JSON.stringify(state), { headers: { 'content-type': 'application/json' } }));
    await waitFor(() => expect(client.getQueryState(keys.me)?.fetchStatus).toBe('idle'));
    expect(fetcher.mock.calls[0][0]).toBe('/api/teacher-assessment/bootstrap');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not restore a different account or Supabase project', () => {
    save(savedClient());
    const otherUser = createClient();
    expect(restorePageCache(otherUser, project, 'different-user')).toBe(false);
    expect(otherUser.getQueryData(keys.profile)).toBeUndefined();
    save(savedClient());
    expect(restorePageCache(createClient(), 'https://other.supabase.co', TEACHER.user_id)).toBe(false);
  });

  it('does not persist admin reports belonging to other teachers', () => {
    const client = savedClient();
    client.setQueryData(keys.teacher('other-teacher'), { private: 'OTHER TEACHER REPORT' });
    save(client);
    expect(JSON.stringify(sessionStorage)).not.toContain('OTHER TEACHER REPORT');
    const restored = createClient();
    expect(restorePageCache(restored, project, TEACHER.user_id)).toBe(true);
    expect(restored.getQueryData(keys.teacher('other-teacher'))).toBeUndefined();
  });

  it('expires old snapshots and clears them on sign-out', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    save(savedClient());
    clock.mockReturnValue(1000 + 9 * 60 * 60_000);
    expect(restorePageCache(createClient(), project, TEACHER.user_id)).toBe(false);
    save(savedClient());
    clearPageCache();
    expect(restorePageCache(createClient(), project, TEACHER.user_id)).toBe(false);
  });

  it('keeps the saved page visible when background verification temporarily fails', async () => {
    save(savedClient());
    const client = createClient();
    restorePageCache(client, project, TEACHER.user_id);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'database_unavailable', message: 'Please retry.' }), {
      status: 503, headers: { 'content-type': 'application/json' },
    })));
    openReport(client);
    expect(screen.getByText('SAVED REPORT')).toBeInTheDocument();
    expect(await screen.findByText(/Showing your saved view/)).toBeInTheDocument();
    expect(screen.getByText('SAVED REPORT')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Checking your access' })).not.toBeInTheDocument();
  });

  it('removes the saved page if the server rejects the session', async () => {
    save(savedClient());
    const client = createClient();
    restorePageCache(client, project, TEACHER.user_id);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"unauthenticated"}', { status: 401, headers: { 'content-type': 'application/json' } })));
    openReport(client);
    expect(screen.getByText('SAVED REPORT')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Sign in to Teacher Assessment' })).toBeInTheDocument();
    expect(screen.queryByText('SAVED REPORT')).not.toBeInTheDocument();
    expect(client.getQueryData(keys.profile)).toBeUndefined();
    expect(sessionStorage.length).toBe(0);
  });

  it('applies changed access from the server instead of trusting saved permissions', async () => {
    save(savedClient());
    const client = createClient();
    restorePageCache(client, project, TEACHER.user_id);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...state,
      me: { ...TEACHER, role: 'student' }, access: { ...state.access, can_take: false, reason: 'NOT_TEACHER' }, profile: null,
    }), { headers: { 'content-type': 'application/json' } })));
    openReport(client);
    expect(await screen.findByRole('heading', { name: "Teacher Assessment isn't available for this account" })).toBeInTheDocument();
    expect(screen.queryByText('SAVED REPORT')).not.toBeInTheDocument();
  });
});
