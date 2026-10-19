import { defineConfig } from 'vitest/config';

// Firestore Security Rules tests; run via `pnpm test:rules` (starts the emulator).
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
