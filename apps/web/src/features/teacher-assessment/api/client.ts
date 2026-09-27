/* Fetch wrappers for /api/teacher-assessment. Credentials ride on the existing
   thisai.pro session cookie; nothing is stored by this module. */
import type {
  AccessResponse, AnswerDTO, AnswerPut, AttemptDTO, BankItem, CohortDTO, ProfileDTO, RosterRow,
} from '../model/types';
import { isMvp } from '../model/config';

export const BASE = '/api/teacher-assessment';

export class ApiError extends Error {
  constructor(public status: number, public body: { error?: string; reason?: string; message?: string; missing?: string[] }) {
    super(body.message || body.error || `HTTP ${status}`);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (isMvp()) {
    const { localRequest } = await import('./localBackend'); // MVP only: keeps the bank out of platform builds
    const out = await localRequest(init.method ?? 'GET', path, init.body ? JSON.parse(String(init.body)) : undefined);
    if (out.status >= 400) throw new ApiError(out.status, (out.body ?? {}) as ApiError['body']);
    return out.body as T;
  }
  const res = await fetch(BASE + path, {
    credentials: 'include',
    ...init,
    headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, body ?? {});
  return body as T;
}

const q = (p: Record<string, string | undefined>) => {
  const s = new URLSearchParams(Object.entries(p).filter(([, v]) => v && v !== 'All') as [string, string][]).toString();
  return s ? '?' + s : '';
};

export const api = {
  access: () => call<AccessResponse>('/access'),
  startAttempt: (grade_band: string, restart = false) =>
    call<AttemptDTO>('/attempts', { method: 'POST', body: JSON.stringify({ grade_band, restart }) }),
  currentAttempt: () => call<AttemptDTO | null>('/attempts/current'),
  putAnswer: (attemptId: string, itemId: string, body: AnswerPut) =>
    call<AnswerDTO>(`/attempts/${encodeURIComponent(attemptId)}/answers/${encodeURIComponent(itemId)}`, { method: 'PUT', body: JSON.stringify(body) }),
  submit: (attemptId: string) => call<ProfileDTO>(`/attempts/${encodeURIComponent(attemptId)}/submit`, { method: 'POST' }),
  myProfile: () => call<ProfileDTO>('/profile/me'),
  preview: () => call<ProfileDTO>('/preview'),
  adminItems: (band?: string, dimension?: string) => call<BankItem[]>('/admin/items' + q({ band, dimension })),
  adminTeachers: () => call<RosterRow[]>('/admin/teachers'),
  adminTeacherProfile: (teacherId: string) => call<ProfileDTO>(`/admin/teachers/${encodeURIComponent(teacherId)}/profile`),
  adminCohort: () => call<CohortDTO>('/admin/cohort'),
};
