import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

export type Handler = (url: string, init?: RequestInit) => { status?: number; body: unknown } | undefined;

export function mockFetch(handler: Handler) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const r = handler(url, init) ?? { status: 404, body: { error: 'not_found' } };
    return new Response(r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export function renderAt(path: string, routes: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>{routes}</Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export const TEACHER = { user_id: 'TCH-0412', role: 'teacher', name: 'Meenakshi Raghavan', email: 'm@x.in', institution_id: 'inst-1', institution_name: "St. Peter's" };
export const ADMIN = { ...TEACHER, user_id: 'ADM-1', role: 'institution_admin', name: "St. Peter's Admin" };
export const allowTake = { can_take: true, can_manage: false, reason: null, cycle_id: 'c2', cycle_name: 'Cycle 2', has_profile: false };
export const allowManage = { can_take: false, can_manage: true, reason: null, cycle_id: 'c2', cycle_name: 'Cycle 2', has_profile: false };
export const deny = (reason: string, has_profile = false) => ({ can_take: false, can_manage: false, reason, cycle_id: null, cycle_name: null, has_profile });
