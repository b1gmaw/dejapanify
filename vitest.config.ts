import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Builds the extension first: tests/bundle.test.ts asserts against the
    // real dist/ artefacts and must not test a stale build.
    globalSetup: ['tests/global-setup.ts'],
    testTimeout: 15000,
  },
});
