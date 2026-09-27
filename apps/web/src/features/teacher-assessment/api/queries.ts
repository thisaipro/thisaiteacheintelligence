import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { fetchMe } from '../../../platform/session';
import type { AnswerDTO, AttemptDTO, Ranked } from '../model/types';
import { ApiError, api } from './client';
import { outbox } from './outbox';

export const keys = {
  me: ['me'] as const,
  access: ['ta', 'access'] as const,
  attempt: ['ta', 'attempt', 'current'] as const,
  profile: ['ta', 'profile', 'me'] as const,
  preview: ['ta', 'preview'] as const,
  items: (band?: string, dim?: string) => ['ta', 'admin', 'items', band ?? 'All', dim ?? 'All'] as const,
  teachers: ['ta', 'admin', 'teachers'] as const,
  teacher: (id: string) => ['ta', 'admin', 'teacher', id] as const,
  cohort: ['ta', 'admin', 'cohort'] as const,
};

const noRetryOn4xx = (n: number, e: unknown) => !(e instanceof ApiError && e.status < 500) && n < 2;

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: fetchMe, staleTime: 5 * 60_000, retry: noRetryOn4xx });
export const useAccess = (enabled = true) =>
  useQuery({ queryKey: keys.access, queryFn: api.access, staleTime: 60_000, retry: noRetryOn4xx, enabled });

export const useCurrentAttempt = (enabled = true) =>
  useQuery({ queryKey: keys.attempt, queryFn: api.currentAttempt, staleTime: Infinity, retry: noRetryOn4xx, enabled });

export function useStartAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ band, restart }: { band: string; restart?: boolean }) => api.startAttempt(band, restart),
    onSuccess: (a) => {
      qc.setQueryData(keys.attempt, a);
      qc.removeQueries({ queryKey: keys.preview });
    },
  });
}

export const blankAnswer = (item_id: string): AnswerDTO => ({ item_id, ranked: [null, null, null, null], note: '', flagged: false, ms_on_item: 0, updated_at: null });

function patchAnswer(qc: QueryClient, itemId: string, patch: Partial<AnswerDTO>): AnswerDTO | null {
  let next: AnswerDTO | null = null;
  qc.setQueryData<AttemptDTO | null>(keys.attempt, (a) => {
    if (!a) return a;
    next = { ...(a.answers[itemId] ?? blankAnswer(itemId)), ...patch };
    return { ...a, answers: { ...a.answers, [itemId]: next } };
  });
  return next;
}

/** Optimistic answer updates, debounced 400ms per item, persisted through the outbox. */
export function useAnswerSaver(getMs: (itemId: string) => number) {
  const qc = useQueryClient();
  const timers = useRef(new Map<string, number>());
  const [pending, setPending] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => outbox.subscribe((n, err) => {
    setPending(n);
    setLastError(err);
    if (n === 0 && !err) setSavedAt(Date.now());
  }), []);

  const persist = useCallback((itemId: string) => {
    const a = qc.getQueryData<AttemptDTO | null>(keys.attempt);
    const ans = a?.answers[itemId];
    if (!a || !ans) return;
    void outbox.enqueue(a.attempt_id, itemId, { ranked: ans.ranked, note: ans.note, flagged: ans.flagged, ms: getMs(itemId) });
    qc.removeQueries({ queryKey: keys.preview });
  }, [qc, getMs]);

  const update = useCallback((itemId: string, patch: Partial<Pick<AnswerDTO, 'ranked' | 'note' | 'flagged'>>) => {
    patchAnswer(qc, itemId, patch);
    const t = timers.current.get(itemId);
    if (t) window.clearTimeout(t);
    timers.current.set(itemId, window.setTimeout(() => { timers.current.delete(itemId); persist(itemId); }, 400));
  }, [qc, persist]);

  /** Push any debounced change now (item change, review, submit). */
  const flushNow = useCallback(async () => {
    for (const [itemId, t] of timers.current) { window.clearTimeout(t); persist(itemId); }
    timers.current.clear();
    await outbox.flush();
  }, [persist]);

  useEffect(() => () => { void flushNow(); }, [flushNow]);

  return { update, flushNow, pending, lastError, savedAt };
}

export function useSubmit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (attemptId: string) => {
      await outbox.flush();
      if (await outbox.count()) throw new ApiError(503, { error: 'offline', message: 'Some answers have not reached the server yet. Check your connection and try again.' });
      return api.submit(attemptId);
    },
    onSuccess: (p) => {
      qc.setQueryData(keys.profile, p);
      qc.setQueryData<AttemptDTO | null>(keys.attempt, (a) => (a ? { ...a, status: 'submitted', submitted_at: p.assessed_at } : a));
      qc.removeQueries({ queryKey: keys.preview });
      void qc.invalidateQueries({ queryKey: keys.access });
    },
  });
}

export const useMyProfile = (enabled = true) =>
  useQuery({ queryKey: keys.profile, queryFn: api.myProfile, retry: noRetryOn4xx, enabled });
export const usePreview = (enabled: boolean) =>
  useQuery({ queryKey: keys.preview, queryFn: api.preview, retry: noRetryOn4xx, enabled });

export const useAdminItems = (band?: string, dim?: string) =>
  useQuery({ queryKey: keys.items(band, dim), queryFn: () => api.adminItems(band, dim), staleTime: 5 * 60_000 });
export const useAdminTeachers = () => useQuery({ queryKey: keys.teachers, queryFn: api.adminTeachers });
export const useAdminTeacherProfile = (id: string) =>
  useQuery({ queryKey: keys.teacher(id), queryFn: () => api.adminTeacherProfile(id), retry: noRetryOn4xx });
export const useAdminCohort = (enabled = true) => useQuery({ queryKey: keys.cohort, queryFn: api.adminCohort, enabled });

export const rankedCount = (r: Ranked | undefined) => (r ? r.filter(Boolean).length : 0);
