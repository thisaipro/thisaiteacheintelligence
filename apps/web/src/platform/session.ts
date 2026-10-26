/* Seam to the host platform (thisai_fe). In thisai_fe, point these at the existing
   thisai.pro session helpers — the Teacher Assessment module never handles
   credentials itself. This standalone shell uses the same endpoints. */
import type { Me } from '@thisai/ta-shared';
import { isSupabase } from '../features/teacher-assessment/model/config';
import { getSupabase, sessionHeaders, supabaseConfigured } from './supabase';
import { clearPageCache } from './pageCache';

export const THISAI_HOME = 'https://thisai.pro';

export class SessionUnavailableError extends Error {
  constructor() {
    super(import.meta.env.DEV
      ? 'The local API is unavailable. Run npm run dev from the repository root to start both the API and web app, then try again.'
      : 'The sign-in service is unavailable. Please try again or contact your assessment coordinator.');
  }
}

/** Existing thisai.pro endpoint: the signed-in user's role and institution. */
export async function fetchMe(): Promise<Me | null> {
  // MVP: no sign-in yet — everyone is the local guest teacher.
  if (import.meta.env.VITE_TA_MODE !== 'platform' && import.meta.env.VITE_TA_MODE !== 'supabase') {
    return (await import('../features/teacher-assessment/api/localBackend')).MVP_USER;
  }
  // Allow the sign-in screen to explain incomplete configuration.
  if (isSupabase() && !supabaseConfigured()) return null;
  const auth = isSupabase() ? await sessionHeaders() : {};
  if (isSupabase() && !auth.authorization) return null;
  let res: Response;
  try {
    res = await fetch('/api/me', { credentials: 'include', headers: { accept: 'application/json', ...auth } });
  } catch (error) {
    if (isSupabase()) throw new SessionUnavailableError();
    throw error;
  }
  if (res.status === 401) return null;
  if (!res.ok) throw isSupabase() ? new SessionUnavailableError() : new Error(`/api/me ${res.status}`);
  if (isSupabase() && !res.headers.get('content-type')?.includes('application/json')) throw new SessionUnavailableError();
  return res.json();
}

/** Existing thisai.pro sign-out. */
export async function signOut() {
  if (import.meta.env.VITE_TA_MODE !== 'platform' && import.meta.env.VITE_TA_MODE !== 'supabase') return;
  if (isSupabase()) {
    clearPageCache();
    await getSupabase().auth.signOut({ scope: 'local' });
    window.location.replace('/teacher-assessment');
    return;
  }
  window.location.href = `${THISAI_HOME}/logout`;
}
