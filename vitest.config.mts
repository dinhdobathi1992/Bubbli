import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` throws unless it is resolved by a React Server Component
      // bundler. It exists to make a browser import of settings.ts a build
      // error; under vitest there is no browser bundle, so stub it out rather
      // than weaken the guard where it actually matters.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // DB tests share one live database; serialise files so they cannot interleave.
    fileParallelism: false,
  },
});
