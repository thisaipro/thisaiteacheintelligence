import pg from 'pg';
import { createApp } from './app';
import { readConfig } from './env';
import { devIdentity, thisaiIdentity } from './auth/identity';
import { supabaseIdentity } from './auth/supabase';
import { loadBank } from './bank';
import { seedDemo } from './dev/seed';
import { MemoryRepo } from './repo/memory';
import { PostgresRepo } from './repo/postgres';
import type { Repo } from './repo/types';
import { Presenter } from './present';
import { databaseConfig } from './db/connection';

/** One pool/app per process (also reused by warm Vercel Function invocations). */
export async function createRuntime() {
  const cfg = readConfig();
  let repo: Repo;
  const pool = cfg.databaseUrl ? new pg.Pool({
    ...databaseConfig(cfg.databaseUrl), max: cfg.poolMax,
    connectionTimeoutMillis: cfg.connectionTimeoutMillis,
    idleTimeoutMillis: cfg.idleTimeoutMillis,
    keepAlive: true, keepAliveInitialDelayMillis: 10_000,
  }) : null;
  pool?.on('error', () => console.error('Unexpected database connection error'));
  if (pool) {
    repo = new PostgresRepo(pool);
  } else {
    const mem = new MemoryRepo({ items: loadBank() });
    if (cfg.devSeed) await seedDemo(mem, new Date(), new Presenter(cfg.shuffleSalt));
    repo = mem;
  }
  const identity = cfg.authMode === 'supabase'
    ? supabaseIdentity(cfg.supabaseUrl!, cfg.supabaseKey!)
    : cfg.authMode === 'thisai'
      ? thisaiIdentity(cfg.thisaiMeUrl!) : devIdentity(cfg.devDefaultUser);
  return createApp({
    repo, identity, moduleEnabled: cfg.moduleEnabled, previewEnabled: cfg.previewEnabled,
    shuffleSalt: cfg.shuffleSalt, devRoutes: cfg.authMode === 'dev',
    sessionRoute: cfg.authMode !== 'thisai',
  });
}

let app: ReturnType<typeof createRuntime> | undefined;
export function getRuntimeApp() {
  return app ??= createRuntime().catch((error) => { app = undefined; throw error; });
}
