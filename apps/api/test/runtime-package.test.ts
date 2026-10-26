import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('deployed runtime package', () => {
  it('loads the compiled backend in native Node without a TypeScript loader', () => {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
      const { getRuntimeApp } = await import('@thisai/ta-api/runtime');
      const app = await getRuntimeApp();
      if (typeof app !== 'function') throw new Error('Missing Express app');
      console.log('runtime loaded');
    `], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 15_000,
      env: {
        ...process.env, NODE_ENV: 'production', VERCEL: '1', TA_AUTH_MODE: 'supabase',
        SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test-key',
        DATABASE_URL: 'postgresql://test:test@localhost:5432/test', TA_SHUFFLE_SALT: 'test-only',
      },
    });
    expect(output).toContain('runtime loaded');
  });
});
