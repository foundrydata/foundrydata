import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Vitest configuration for test matchers and infrastructure
 * Inherits from root config but customized for testing test utilities
 *
 * Key differences from root config:
 * - Focuses on test/ directory only
 * - Reduced FC_NUM_RUNS for faster feedback during matcher development
 * - Coverage disabled as this tests the testing infrastructure itself
 * - Uses draft 2020-12 to test latest schema features in matchers
 */

// Platform-specific pool configuration (consistent with root)
const getPoolConfig = (): {
  pool: string;
  poolOptions: {
    threads?: { singleThread: boolean; isolate: boolean };
    forks?: { isolate: boolean };
  };
} => {
  const pool = process.platform === 'win32' ? 'threads' : 'forks';
  return {
    pool,
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true,
      },
      forks: {
        isolate: true,
      },
    },
  };
};

// Environment-based configuration (consistent with root)
const isCI = process.env.CI === 'true';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // ========================================================================
    // EXECUTION ENVIRONMENT (consistent with root)
    // ========================================================================

    environment: 'node',

    // Platform-aware pool configuration (consistent with root)
    ...getPoolConfig(),

    // Setup files
    setupFiles: ['./test/setup.ts'],

    // ========================================================================
    // TEST DISCOVERY (specific to test utilities)
    // ========================================================================

    // Test discovery - only test/ directory for matcher testing
    include: ['test/**/*.{test,spec}.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/coverage/**',
    ],

    // ========================================================================
    // DETERMINISTIC EXECUTION CONFIGURATION (consistent with root)
    // ========================================================================

    // No retries - surface issues immediately (consistent with root)
    retry: 0,

    // Disable file parallelism in CI for deterministic results
    fileParallelism: !isCI,

    // Extended timeouts for property-based testing (consistent with root)
    testTimeout: isCI ? 30000 : 10000, // 30s in CI, 10s locally
    hookTimeout: 10000, // 10s for setup/teardown hooks
    teardownTimeout: 5000, // 5s for cleanup

    // ========================================================================
    // REPORTING AND LOGGING (enhanced for matcher development)
    // ========================================================================

    // Enhanced reporter for matcher development
    reporters: ['verbose'],

    // Logging configuration
    logHeapUsage: isCI,
    silent: false,

    // ========================================================================
    // COVERAGE CONFIGURATION (disabled for test utilities)
    // ========================================================================

    // Coverage disabled for test utilities
    coverage: {
      enabled: false,
    },

    // ========================================================================
    // PERFORMANCE OPTIMIZATION (consistent with root)
    // ========================================================================

    // Memory management
    isolate: true,

    // ========================================================================
    // ENVIRONMENT VARIABLES (customized for matcher testing)
    // ========================================================================

    env: {
      // Test-specific environment variables
      NODE_ENV: 'test',
      TEST_SEED: '424242', // Fixed seed for deterministic testing
      FC_NUM_RUNS: isCI ? '100' : '50', // Reduced for faster matcher development feedback
      SCHEMA_DRAFT: '2020-12', // Use latest draft to test newest features in matchers
      VITEST_POOL: getPoolConfig().pool,
    },
  },
});
