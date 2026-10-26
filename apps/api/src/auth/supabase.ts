import type { Me } from '@thisai/ta-shared';
import { z } from 'zod';
import type { IdentityResolver } from './identity';

const Membership = z.object({
  role: z.enum(['teacher', 'institution_admin']),
  institution_id: z.string().trim().min(1),
  institution_name: z.string().trim().min(1),
});

/** Verify with Supabase Auth on every request. Roles come only from server-managed
 * app_metadata; user_metadata and caller-supplied identity headers are untrusted. */
export function supabaseIdentity(url: string, key: string, fetchImpl: typeof fetch = fetch): IdentityResolver {
  return async (req) => {
    const authorization = req.headers.authorization;
    if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) return null;
    const response = await fetchImpl(`${url.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { apikey: key, authorization },
      signal: AbortSignal.timeout(10_000),
    });
    if ([401, 403].includes(response.status)) return null;
    if (!response.ok) throw new Error('Supabase authentication is unavailable');
    const user = await response.json();
    if (!user || typeof user.id !== 'string' || !user.id || user.is_anonymous) return null;
    const membership = Membership.safeParse(user.app_metadata);
    const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
    const me: Me = {
      user_id: user.id,
      name: text(user.user_metadata?.name) || text(user.email) || 'Teacher',
      email: text(user.email) || undefined,
      department: text(user.user_metadata?.department) || null,
      role: membership.success ? membership.data.role : 'unassigned',
      institution_id: membership.success ? membership.data.institution_id : null,
      institution_name: membership.success ? membership.data.institution_name : null,
    };
    return me;
  };
}
