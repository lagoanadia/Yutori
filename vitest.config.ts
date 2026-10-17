import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// `cloudflare:workers` solo existe dentro de Workers: en los tests se sustituye por una D1 simulada sobre node:sqlite.
export default defineConfig({
  resolve: {
    alias: {
      'cloudflare:workers': fileURLToPath(new URL('./tests/apoyo/cloudflare-workers.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/apoyo/preparar.ts'],
  },
});
