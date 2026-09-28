/* Seam to the host platform (thisai_fe). In thisai_fe, point these at the existing
   thisai.pro session helpers — the Teacher Assessment module never handles
   credentials itself. This standalone shell uses the same endpoints. */
import type { Me } from '@thisai/ta-shared';
import { isMvp } from '../features/teacher-assessment/model/config';

export const THISAI_HOME = 'https://thisai.pro';

/** Existing thisai.pro endpoint: the signed-in user's role and institution. */
export async function fetchMe(): Promise<Me | null> {
  // MVP: no sign-in yet — everyone is the local guest teacher.
  if (isMvp()) return (await import('../features/teacher-assessment/api/localBackend')).MVP_USER;
  const res = await fetch('/api/me', { credentials: 'include', headers: { accept: 'application/json' } });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`/api/me ${res.status}`);
  return res.json();
}

/** Existing thisai.pro sign-out. */
export function signOut() {
  if (isMvp()) return;
  window.location.href = `${THISAI_HOME}/logout`;
}
