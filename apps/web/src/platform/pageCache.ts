import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query';
import type { Me } from '@thisai/ta-shared';

const KEY = 'thisai-ta-page-v1';
const MAX_AGE = 8 * 60 * 60_000;
const ownKeys = new Set([
  JSON.stringify(['me']), JSON.stringify(['ta', 'access']),
  JSON.stringify(['ta', 'attempt', 'current']), JSON.stringify(['ta', 'profile', 'me']),
  JSON.stringify(['ta', 'preview']),
]);

interface PageCache { version: 1; project: string; userId: string; savedAt: number; state: DehydratedState }

export function clearPageCache() {
  try { sessionStorage.removeItem(KEY); } catch { /* storage may be blocked */ }
}

/** Restore only after the SDK has identified the active session. Cached access
 * is a UI hint; the server continues authorizing every read and write. */
export function restorePageCache(client: QueryClient, project: string, userId: string) {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return false;
    const cached = JSON.parse(raw) as PageCache;
    if (cached.version !== 1 || cached.project !== project || cached.userId !== userId
      || !Number.isFinite(cached.savedAt) || Date.now() - cached.savedAt > MAX_AGE) {
      clearPageCache(); return false;
    }
    const queries = cached.state.queries.filter((q) => ownKeys.has(JSON.stringify(q.queryKey))).map((q) => ({
      ...q, state: { ...q.state, dataUpdatedAt: Date.now(), isInvalidated: false, fetchStatus: 'idle' as const },
    }));
    const identity = queries.find((q) => JSON.stringify(q.queryKey) === '["me"]')?.state.data as Me | undefined;
    if (identity?.user_id !== userId) { clearPageCache(); return false; }
    hydrate(client, { mutations: [], queries });
    // Render the saved view immediately, but always refresh identity/access in
    // the background on a full page reload.
    void client.invalidateQueries({ queryKey: ['me'], refetchType: 'none' });
    return true;
  } catch { clearPageCache(); return false; }
}

export function persistPageCache(client: QueryClient, project: string, userId: string) {
  const save = () => {
    const identity = client.getQueryState<Me | null>(['me']);
    if (identity?.status === 'success' && identity.data === null) { clearPageCache(); return; }
    // Keep the last verified snapshot if a background refresh failed.
    if (identity?.status !== 'success' || identity.fetchStatus !== 'idle' || identity.data?.user_id !== userId) return;
    try {
      const state = dehydrate(client, {
        shouldDehydrateMutation: () => false,
        shouldDehydrateQuery: (q) => q.state.status === 'success' && ownKeys.has(JSON.stringify(q.queryKey)),
      });
      sessionStorage.setItem(KEY, JSON.stringify({ version: 1, project, userId, savedAt: Date.now(), state } satisfies PageCache));
    } catch { /* keep working if storage is unavailable/full */ }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = client.getQueryCache().subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(save, 100);
  });
  const flush = () => { clearTimeout(timer); save(); };
  window.addEventListener('pagehide', flush);
  return () => { unsubscribe(); window.removeEventListener('pagehide', flush); clearTimeout(timer); };
}
