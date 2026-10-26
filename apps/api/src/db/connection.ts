import type pg from 'pg';
import { SUPABASE_CA } from './supabase-ca';

/** Supabase uses its own root CA. Keep chain and hostname verification enabled
 * rather than disabling TLS checks to work around Node's default trust store. */
export function databaseConfig(connectionString: string, env: NodeJS.ProcessEnv = process.env): pg.PoolConfig {
  const url = new URL(connectionString);
  const supabase = url.hostname.endsWith('.pooler.supabase.com') || /^db\.[a-z0-9-]+\.supabase\.co$/.test(url.hostname);
  const ca = env.DATABASE_SSL_CA?.replace(/\\n/g, '\n') || (supabase ? SUPABASE_CA : undefined);
  if (!ca) return { connectionString };
  // pg's URL SSL options otherwise replace the explicit CA configuration.
  for (const name of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) url.searchParams.delete(name);
  return { connectionString: url.toString(), ssl: { ca, rejectUnauthorized: true } };
}
