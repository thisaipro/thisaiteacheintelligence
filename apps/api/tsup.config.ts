import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { server: 'src/server.ts', 'db/migrate': 'src/db/migrate.ts' },
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  // The shared catalogue/contracts package ships as TypeScript source; bundle it.
  noExternal: ['@thisai/ta-shared'],
});
