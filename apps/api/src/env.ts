import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

// Local development only; deployment environment variables take precedence.
config({ path: [
  fileURLToPath(new URL('../.env', import.meta.url)),
  fileURLToPath(new URL('../../../.env', import.meta.url)),
], quiet: true });

export type AuthMode = 'dev' | 'thisai' | 'supabase';

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === 'production';
  const serverless = env.VERCEL === '1';
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authMode = env.TA_AUTH_MODE ?? (supabaseUrl && supabaseKey ? 'supabase' : production ? 'thisai' : 'dev');
  if (!['dev', 'thisai', 'supabase'].includes(authMode)) throw new Error('Unknown TA_AUTH_MODE');
  if (production && authMode === 'dev') throw new Error('TA_AUTH_MODE=dev is not allowed in production');
  if (authMode === 'thisai' && !env.THISAI_ME_URL) throw new Error('THISAI_ME_URL is required when TA_AUTH_MODE=thisai');
  // A persistent local API can reuse session-pooler connections. Vercel uses
  // transaction pooling; an explicit DATABASE_URL always wins.
  const databaseUrl = env.DATABASE_URL || (!serverless && env.POSTGRES_URL_NON_POOLING) || env.POSTGRES_URL;
  if ((production || authMode === 'supabase') && !databaseUrl) throw new Error('DATABASE_URL is required');
  if (authMode === 'supabase' && (!supabaseUrl || !supabaseKey)) {
    throw new Error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY) are required');
  }
  if (production && authMode === 'supabase' && !env.TA_SHUFFLE_SALT) {
    throw new Error('TA_SHUFFLE_SALT is required in production Supabase mode');
  }
  if (supabaseUrl) {
    const url = new URL(supabaseUrl);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
      throw new Error('SUPABASE_URL must use HTTPS');
    }
  }
  const integer = (key: string, fallback: number) => {
    const value = Number(env[key] ?? fallback);
    if (!Number.isInteger(value) || value < 1) throw new Error(`${key} must be a positive integer`);
    return value;
  };
  const poolMax = integer('TA_DB_POOL_MAX', serverless ? 1 : 4);
  const connectionTimeoutMillis = integer('TA_DB_CONNECT_TIMEOUT_MS', 30_000);
  const idleTimeoutMillis = integer('TA_DB_IDLE_TIMEOUT_MS', serverless ? 5_000 : 60_000);
  const flag = (v: string | undefined, dflt: boolean) => v === undefined ? dflt : /^(1|true|yes|on)$/i.test(v);
  return {
    authMode: authMode as AuthMode, databaseUrl, supabaseUrl, supabaseKey, poolMax,
    connectionTimeoutMillis, idleTimeoutMillis,
    thisaiMeUrl: env.THISAI_ME_URL,
    shuffleSalt: env.TA_SHUFFLE_SALT ?? '',
    moduleEnabled: flag(env.TA_MODULE_ENABLED, true),
    previewEnabled: flag(env.TA_PREVIEW_ENABLED, true),
    devSeed: flag(env.TA_DEV_SEED, true),
    devDefaultUser: env.TA_DEV_DEFAULT_USER ?? 't',
  };
}
