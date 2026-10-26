/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  const root = loadEnv(mode, fileURLToPath(new URL('../../', import.meta.url)), '');
  const local = loadEnv(mode, fileURLToPath(new URL('./', import.meta.url)), '');
  const env = { ...root, ...local };
  // Vercel's integration supplies NEXT_PUBLIC_* names. Map only public values;
  // never expose the entire server environment by widening Vite's envPrefix.
  process.env.VITE_SUPABASE_URL ??= env.VITE_SUPABASE_URL || env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??= env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  process.env.VITE_TA_MODE ??= env.VITE_TA_MODE || (process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_PUBLISHABLE_KEY ? 'supabase' : 'mvp');
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { '/api': { target: env.TA_API_URL || 'http://localhost:8787', changeOrigin: true } },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test-setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
    },
  };
});
