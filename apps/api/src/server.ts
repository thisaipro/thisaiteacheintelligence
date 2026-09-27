/* Env flags — see the feature README for the full list. */
import pg from 'pg';
import { createApp } from './app';
import { devIdentity, thisaiIdentity } from './auth/identity';
import { loadBank } from './bank';
import { seedDemo } from './dev/seed';
import { MemoryRepo } from './repo/memory';
import { PostgresRepo } from './repo/postgres';
import type { Repo } from './repo/types';
import { Presenter } from './present';

const env = process.env;
const flag = (v: string | undefined, dflt: boolean) => (v === undefined ? dflt : /^(1|true|yes|on)$/i.test(v));
const production = env.NODE_ENV === 'production';
const authMode = env.TA_AUTH_MODE ?? (production ? 'thisai' : 'dev');

if (production && authMode === 'dev') throw new Error('TA_AUTH_MODE=dev is not allowed in production');
if (authMode === 'thisai' && !env.THISAI_ME_URL) throw new Error('THISAI_ME_URL is required when TA_AUTH_MODE=thisai');
if (production && !env.DATABASE_URL) throw new Error('DATABASE_URL is required in production');

async function main() {
  const salt = env.TA_SHUFFLE_SALT ?? '';
  let repo: Repo;
  if (env.DATABASE_URL) {
    repo = new PostgresRepo(new pg.Pool({ connectionString: env.DATABASE_URL }));
  } else {
    const mem = new MemoryRepo({ items: loadBank() });
    if (flag(env.TA_DEV_SEED, true)) await seedDemo(mem, new Date(), new Presenter(salt));
    repo = mem;
  }
  const app = createApp({
    repo,
    identity: authMode === 'thisai' ? thisaiIdentity(env.THISAI_ME_URL!) : devIdentity(env.TA_DEV_DEFAULT_USER ?? 't'),
    moduleEnabled: flag(env.TA_MODULE_ENABLED, true),
    previewEnabled: flag(env.TA_PREVIEW_ENABLED, true),
    shuffleSalt: salt,
    devRoutes: authMode === 'dev',
  });
  const port = Number(env.PORT ?? 8787);
  app.listen(port, () => console.log(`teacher-assessment api on :${port} (auth=${authMode}, store=${env.DATABASE_URL ? 'postgres' : 'memory'})`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
