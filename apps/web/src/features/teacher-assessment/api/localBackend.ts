/* MVP backend: runs the same service as apps/api inside the browser.
   No sign-in; one local user who can both take the assessment and view the admin pages.
   State persists in localStorage on this device only. Replace by setting VITE_TA_MODE=platform. */
import type { Me } from '@thisai/ta-shared';
import { DEV_INSTITUTION, MemoryRepo, createService, parseBank, seedDemo, type AccessDecision, type Cycle } from '@thisai/ta-api/core';
import bankJson from '@thisai/ta-api/data/item-bank.v1.json';

export const MVP_USER: Me = {
  user_id: 'mvp-teacher',
  role: 'teacher',
  name: 'Guest teacher',
  institution_id: DEV_INSTITUTION.id,
  institution_name: DEV_INSTITUTION.name,
  department: null,
};

const KEY = 'thisai-ta-mvp-v1';

function mvpAccess(_me: Me, cycles: Cycle[], now: Date): AccessDecision {
  const enabled = cycles.filter((c) => c.enabled).sort((a, b) => b.opens_at.getTime() - a.opens_at.getTime());
  const cycle = enabled.find((c) => c.opens_at <= now && now < c.closes_at) ?? enabled[0] ?? null;
  return { can_take: true, can_manage: true, reason: null, cycle_id: cycle?.cycle_id ?? null, cycle_name: cycle?.name ?? null, has_profile: false, cycle };
}

let ready: Promise<{ repo: MemoryRepo; service: ReturnType<typeof createService> }> | null = null;

function store(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

function init() {
  return (ready ??= (async () => {
    const repo = new MemoryRepo({ items: parseBank(bankJson) });
    const saved = store()?.getItem(KEY);
    let restored = false;
    if (saved) {
      try { repo.restore(saved); restored = true; } catch { /* corrupt or old snapshot: reseed */ }
    }
    if (!restored) {
      await seedDemo(repo, new Date());
      save(repo);
    }
    return { repo, service: createService({ repo, accessOverride: mvpAccess }) };
  })());
}

function save(repo: MemoryRepo) {
  try { store()?.setItem(KEY, repo.snapshot()); } catch { /* storage full or blocked: keep in memory */ }
}

/** Same contract as fetch against /api/teacher-assessment: resolves {status, body}. */
export async function localRequest(method: string, pathAndQuery: string, body?: unknown) {
  const { repo, service } = await init();
  const [path, qs] = pathAndQuery.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs ?? ''));
  const out = await service.handle({ method, path, query, body, me: MVP_USER });
  if (method !== 'GET') save(repo);
  return out;
}

/** Wipes this device's MVP data and reseeds the demo roster. */
export function resetMvpData() {
  try { store()?.removeItem(KEY); } catch { /* ignore */ }
  ready = null;
}
