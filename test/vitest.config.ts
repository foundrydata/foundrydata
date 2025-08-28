import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Vitest configuration for test matchers and infrastructure
 * Separate from main packages to allow standalone testing of test utilities
 */

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',

    // Test discovery
    include: ['test/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],

    // Extended timeouts for property-based testing
    testTimeout: 10000,
    hookTimeout: 10000,

    // Setup
    setupFiles: ['./test/setup.ts'],

    // Pool configuration
    pool: process.platform === 'win32' ? 'threads' : 'forks',

    // Environment variables
    env: {
      NODE_ENV: 'test',
      TEST_SEED: '424242',
      FC_NUM_RUNS: '50', // Reduced for faster testing
      SCHEMA_DRAFT: '2020-12',
    },

    // Reporting
    reporter: ['verbose'],

    // Coverage (optional for test utilities)
    coverage: {
      enabled: false,
    },
  },
});
