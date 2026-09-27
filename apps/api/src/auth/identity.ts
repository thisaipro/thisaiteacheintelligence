/* Identity comes from the existing thisai.pro session — this module never
   sees a password and stores no credentials.

   mode 'thisai': forwards the caller's Cookie / Authorization header to the
                  platform's GET /api/me (THISAI_ME_URL) and trusts its answer
                  for user_id, role and institution_id.
   mode 'dev':    resolves one of the fixture accounts below from the
                  `ta_dev_user` cookie or `x-ta-dev-user` header. Refused in production. */
import type { Request } from 'express';
import type { Me } from '@thisai/ta-shared';

export type IdentityResolver = (req: Request) => Promise<Me | null>;

export function thisaiIdentity(meUrl: string, fetchImpl: typeof fetch = fetch): IdentityResolver {
  return async (req) => {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (req.headers.cookie) headers.cookie = req.headers.cookie;
    if (req.headers.authorization) headers.authorization = req.headers.authorization;
    const res = await fetchImpl(meUrl, { headers });
    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) throw new Error(`thisai.pro /api/me responded ${res.status}`);
    const me = (await res.json()) as Me;
    if (!me || !me.user_id || !me.role) return null;
    return { ...me, institution_id: me.institution_id ?? null };
  };
}

import { DEV_INSTITUTION } from './dev-institution';
export { DEV_INSTITUTION };

export const DEV_USERS: Record<string, Me> = {
  t: { user_id: 'TCH-0412', role: 'teacher', name: 'Meenakshi Raghavan', email: 'meenakshi.r@stpeters.edu.in',
       institution_id: DEV_INSTITUTION.id, institution_name: DEV_INSTITUTION.name, department: 'Science' },
  a: { user_id: 'ADM-0001', role: 'institution_admin', name: "St. Peter's Admin", email: 'admin@stpeters.edu.in',
       institution_id: DEV_INSTITUTION.id, institution_name: DEV_INSTITUTION.name },
  s: { user_id: 'STU-2231', role: 'student', name: 'Arjun Kumar', email: 'arjun.k@stpeters.edu.in',
       institution_id: DEV_INSTITUTION.id, institution_name: DEV_INSTITUTION.name },
  i: { user_id: 'IND-0907', role: 'teacher', name: 'Priya S', email: 'priya.tutor@gmail.com', institution_id: null, institution_name: null },
  d: { user_id: 'TCH-8801', role: 'teacher', name: 'Ravi Menon', email: 'ravi.m@greenfield.edu.in',
       institution_id: 'inst-greenfield', institution_name: 'Greenfield Public School' },
  c: { user_id: 'TCH-7702', role: 'teacher', name: 'Anitha Joseph', email: 'anitha.j@lakeview.edu.in',
       institution_id: 'inst-lakeview', institution_name: 'Lakeview College' },
};

export function devIdentity(defaultUser = 't'): IdentityResolver {
  return async (req) => {
    const key = (req.headers['x-ta-dev-user'] as string | undefined) ?? req.cookies?.ta_dev_user ?? defaultUser;
    if (key === 'none') return null;
    return DEV_USERS[key] ?? null;
  };
}
