import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/env';
import { databaseConfig } from '../src/db/connection';

const configured = {
  TA_AUTH_MODE: 'supabase', SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'public-key', DATABASE_URL: 'postgresql://example',
};

describe('runtime environment', () => {
  it('keeps the existing local dev defaults', () => {
    expect(readConfig({})).toMatchObject({ authMode: 'dev', devSeed: true, poolMax: 4, connectionTimeoutMillis: 30_000, idleTimeoutMillis: 60_000 });
  });
  it('requires persistent storage and Auth configuration in Supabase mode', () => {
    expect(() => readConfig({ TA_AUTH_MODE: 'supabase' })).toThrow('DATABASE_URL');
    expect(() => readConfig({ TA_AUTH_MODE: 'supabase', DATABASE_URL: 'postgresql://example' })).toThrow('SUPABASE_URL');
    expect(readConfig(configured)).toMatchObject({ authMode: 'supabase', poolMax: 4 });
  });
  it('supports Vercel Postgres and legacy anon-key aliases', () => {
    expect(readConfig({ TA_AUTH_MODE: 'supabase', SUPABASE_URL: configured.SUPABASE_URL, SUPABASE_ANON_KEY: 'anon-key', POSTGRES_URL: configured.DATABASE_URL }))
      .toMatchObject({ databaseUrl: configured.DATABASE_URL, supabaseKey: 'anon-key' });
    expect(readConfig({ NEXT_PUBLIC_SUPABASE_URL: configured.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: 'public-key', POSTGRES_URL: configured.DATABASE_URL }))
      .toMatchObject({ authMode: 'supabase', supabaseUrl: configured.SUPABASE_URL });
  });
  it('refuses insecure or unknown configuration', () => {
    expect(() => readConfig({ NODE_ENV: 'production', TA_AUTH_MODE: 'dev' })).toThrow('not allowed');
    expect(() => readConfig({ TA_AUTH_MODE: 'typo' })).toThrow('Unknown');
    expect(() => readConfig({ ...configured, SUPABASE_URL: 'http://example.com' })).toThrow('HTTPS');
    expect(() => readConfig({ ...configured, TA_DB_POOL_MAX: '0' })).toThrow('positive integer');
    expect(() => readConfig({ ...configured, NODE_ENV: 'production' })).toThrow('TA_SHUFFLE_SALT');
    expect(() => readConfig({ ...configured, TA_DB_CONNECT_TIMEOUT_MS: '0' })).toThrow('positive integer');
    expect(() => readConfig({ ...configured, TA_DB_IDLE_TIMEOUT_MS: 'NaN' })).toThrow('positive integer');
  });
  it('uses session pooling locally and transaction pooling on Vercel', () => {
    const env = { ...configured, DATABASE_URL: undefined, POSTGRES_URL: 'postgresql://transaction', POSTGRES_URL_NON_POOLING: 'postgresql://session' };
    expect(readConfig(env)).toMatchObject({ databaseUrl: 'postgresql://session', poolMax: 4, idleTimeoutMillis: 60_000 });
    expect(readConfig({ ...env, VERCEL: '1' })).toMatchObject({ databaseUrl: 'postgresql://transaction', poolMax: 1, idleTimeoutMillis: 5_000 });
    expect(readConfig({ ...env, DATABASE_URL: 'postgresql://explicit' }).databaseUrl).toBe('postgresql://explicit');
  });
  it('honours explicit connection pool overrides', () => {
    expect(readConfig({ ...configured, VERCEL: '1', TA_DB_POOL_MAX: '2', TA_DB_CONNECT_TIMEOUT_MS: '45000', TA_DB_IDLE_TIMEOUT_MS: '8000' }))
      .toMatchObject({ poolMax: 2, connectionTimeoutMillis: 45_000, idleTimeoutMillis: 8_000 });
  });
});

describe('database TLS configuration', () => {
  it('uses the Supabase CA with verification and removes conflicting URL SSL options', () => {
    const cfg = databaseConfig('postgresql://user:password@aws-0-region.pooler.supabase.com:6543/postgres?sslmode=require', {});
    expect(cfg.connectionString).not.toContain('sslmode');
    expect(cfg.ssl).toMatchObject({ rejectUnauthorized: true, ca: expect.stringContaining('BEGIN CERTIFICATE') });
  });
  it('allows a CA override for certificate rotation and leaves local Postgres alone', () => {
    expect(databaseConfig('postgresql://user@db.project.supabase.co/postgres', { DATABASE_SSL_CA: 'custom\\nca' }).ssl)
      .toEqual({ ca: 'custom\nca', rejectUnauthorized: true });
    expect(databaseConfig('postgresql://localhost/test', {})).toEqual({ connectionString: 'postgresql://localhost/test' });
  });
});
