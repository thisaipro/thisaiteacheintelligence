import type { Request } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { supabaseIdentity } from '../src/auth/supabase';
import { createApp } from '../src/app';
import { loadBank } from '../src/bank';
import { devCycles } from '../src/dev/seed';
import { MemoryRepo } from '../src/repo/memory';

const membership = { role: 'teacher', institution_id: 'inst-stpeters', institution_name: "St. Peter's" };
const user = (id = 'teacher-1', meta = membership) => ({
  id, email: `${id}@example.com`, app_metadata: meta,
  user_metadata: { name: id, role: 'institution_admin', institution_id: 'attacker-school' },
});
const req = (token?: string) => ({ headers: { authorization: token ? `Bearer ${token}` : undefined, 'x-ta-dev-user': 'a' } }) as unknown as Request;
const mockedFetch = (status: number, body: unknown) => vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('Supabase identity', () => {
  it('requires a bearer and does not accept fixture headers', async () => {
    const fetcher = mockedFetch(200, user());
    expect(await supabaseIdentity('https://example.supabase.co', 'public-key', fetcher)(req())).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('verifies the token with Auth and uses only administrator-managed membership', async () => {
    const fetcher = mockedFetch(200, user());
    expect(await supabaseIdentity('https://example.supabase.co/', 'public-key', fetcher)(req('valid'))).toMatchObject({
      user_id: 'teacher-1', role: 'teacher', institution_id: 'inst-stpeters', name: 'teacher-1',
    });
    expect(fetcher).toHaveBeenCalledWith('https://example.supabase.co/auth/v1/user', expect.objectContaining({
      headers: { apikey: 'public-key', authorization: 'Bearer valid' },
    }));
  });

  it.each([401, 403])('rejects invalid or expired tokens (%s)', async (status) => {
    expect(await supabaseIdentity('https://example.supabase.co', 'key', mockedFetch(status, {}))(req('bad'))).toBeNull();
  });

  it('keeps unprovisioned users unassigned even if they edit user_metadata', async () => {
    const fetcher = mockedFetch(200, user('unassigned', {} as typeof membership));
    expect(await supabaseIdentity('https://example.supabase.co', 'key', fetcher)(req('valid'))).toMatchObject({
      role: 'unassigned', institution_id: null,
    });
  });

  it('does not treat an Auth outage as an anonymous session', async () => {
    await expect(supabaseIdentity('https://example.supabase.co', 'key', mockedFetch(500, {}))(req('valid'))).rejects.toThrow('unavailable');
  });

  it('isolates two teachers and allows an administrator in the same institution', async () => {
    const repo = new MemoryRepo({ items: loadBank() });
    for (const cycle of devCycles(new Date())) repo.addCycle(cycle);
    repo.addCycle({ ...devCycles(new Date())[0], cycle_id: 'other-cycle', institution_id: 'other-school' });
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const token = new Headers(init?.headers).get('authorization')?.replace('Bearer ', '');
      if (!['t1', 't2', 'admin', 'other-admin'].includes(token ?? '')) return new Response('{}', { status: 401 });
      const meta = token!.includes('admin') ? { ...membership, role: 'institution_admin' } : membership;
      if (token === 'other-admin') meta.institution_id = 'other-school';
      return new Response(JSON.stringify(user(token, meta)));
    });
    const app = createApp({ repo, identity: supabaseIdentity('https://example.supabase.co', 'key', fetcher), sessionRoute: true });
    const as = (token: string) => ({
      get: (path: string) => request(app).get(`/api/teacher-assessment${path}`).auth(token, { type: 'bearer' }),
      post: (path: string, body = {}) => request(app).post(`/api/teacher-assessment${path}`).auth(token, { type: 'bearer' }).send(body),
    });
    expect((await request(app).get('/api/me')).status).toBe(401);
    expect((await request(app).get('/api/me').auth('t1', { type: 'bearer' })).body.role).toBe('teacher');
    expect((await request(app).get('/api/dev/users')).status).toBe(404);
    const first = await as('t1').post('/attempts', { grade_band: 'Pre-school' });
    const second = await as('t2').post('/attempts', { grade_band: 'Pre-school' });
    expect(first.status).toBe(201);
    expect(first.body.attempt_id).not.toBe(second.body.attempt_id);
    expect((await as('t1').get('/attempts/current')).body.attempt_id).toBe(first.body.attempt_id);
    expect((await as('t2').post(`/attempts/${first.body.attempt_id}/submit`)).status).toBe(404);
    expect((await as('t1').get('/admin/teachers')).status).toBe(403);
    expect((await as('admin').get('/admin/teachers')).body).toHaveLength(2);
    expect((await as('other-admin').get('/admin/teachers')).body).toHaveLength(0);
  });
});
