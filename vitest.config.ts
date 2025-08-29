import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * FoundryData Testing Architecture v2.1 - Vitest Configuration
 *
 * This configuration provides deterministic, platform-aware testing with:
 * - Fixed execution order for consistent results
 * - Platform-specific pool configuration for compatibility
 * - No retries to surface issues immediately
 * - Extended timeouts for property-based testing
 * - Comprehensive coverage reporting
 * - Global setup/teardown for environment consistency
 */

// Platform-specific pool configuration
const getPoolConfig = () => {
  // Windows uses threads for better performance and compatibility
  // Unix-like systems use forks for better isolation
  const pool = process.platform === 'win32' ? 'threads' : 'forks';

  return {
    pool,
    poolOptions: {
      threads: {
        // Thread-specific options
        singleThread: false,
        isolate: true,
      },
      forks: {
        // Fork-specific options
        isolate: true,
      },
    },
  };
};

// Environment-based configuration
const isCI = process.env.CI === 'true';
const isDevelopment = process.env.NODE_ENV === 'development';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // ========================================================================
    // EXECUTION ENVIRONMENT
    // ========================================================================

    environment: 'node',

    // Platform-aware pool configuration
    ...getPoolConfig(),

    // Global setup and teardown
    globalSetup: ['./test/global-setup.ts'],
    globalTeardown: ['./test/global-teardown.ts'],
    setupFiles: ['./test/setup.ts'],

    // ========================================================================
    // TEST DISCOVERY AND EXECUTION
    // ========================================================================

    // Test files pattern - includes all packages in monorepo
    include: ['packages/**/*.{test,spec}.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/coverage/**',
    ],

    // ========================================================================
    // DETERMINISTIC EXECUTION CONFIGURATION
    // ========================================================================

    // No retries - surface issues immediately
    retry: 0,

    // Disable file parallelization in CI for deterministic results
    fileParallelism: !isCI,

    // Extended timeouts for property-based testing
    testTimeout: isCI ? 30000 : 10000, // 30s in CI, 10s locally
    hookTimeout: 10000, // 10s for setup/teardown hooks
    teardownTimeout: 5000, // 5s for cleanup

    // ========================================================================
    // REPORTING AND LOGGING
    // ========================================================================

    // Enhanced reporter configuration
    reporters: isDevelopment ? ['verbose'] : ['default'],

    // Logging configuration
    logHeapUsage: isCI,
    silent: false,

    // ========================================================================
    // COVERAGE CONFIGURATION
    // ========================================================================

    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'lcov', 'html', 'json-summary'],

      // Include patterns
      include: ['packages/*/src/**/*.{ts,tsx}'],

      // Exclude patterns
      exclude: [
        'packages/*/src/**/*.d.ts',
        'packages/*/src/**/*.{test,spec}.{ts,tsx}',
        'packages/*/src/**/__tests__/**',
        'packages/*/src/**/test/**',
        'packages/*/src/**/tests/**',
        // Exclude type-only files
        'packages/*/src/types/index.ts',
        'packages/*/src/**/types.ts',
      ],

      // Coverage thresholds - strict for quality assurance
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
        // Per-package thresholds can be customized
        'packages/core/': {
          branches: 85,
          functions: 85,
          lines: 85,
          statements: 85,
        },
      },

      // Additional coverage options
      all: true, // Include all source files
      skipFull: false, // Don't skip files with 100% coverage
      watermarks: {
        statements: [80, 95],
        functions: [80, 95],
        branches: [80, 95],
        lines: [80, 95],
      },
    },

    // ========================================================================
    // MONOREPO PROJECT CONFIGURATION
    // ========================================================================

    // Projects configuration for monorepo - each package is a project
    projects: ['packages/*'],

    // ========================================================================
    // DEBUGGING AND DEVELOPMENT
    // ========================================================================

    // Enable debugging in development
    inspect: isDevelopment,
    inspectBrk: false,

    // Browser testing (disabled by default, can be enabled for specific tests)
    browser: {
      enabled: false,
      // Configuration would go here if browser testing is needed
    },

    // Watch mode configuration (development only)
    watch: isDevelopment,
    watchExclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.git/**',
    ],

    // ========================================================================
    // PERFORMANCE OPTIMIZATION
    // ========================================================================

    // Memory management
    isolate: true,

    // ========================================================================
    // ENVIRONMENT VARIABLES
    // ========================================================================

    env: {
      // Test-specific environment variables
      NODE_ENV: 'test',
      TEST_SEED: '424242',
      FC_NUM_RUNS: isCI ? '1000' : '100',
      SCHEMA_DRAFT: 'draft-07',
      VITEST_POOL: getPoolConfig().pool,
    },
  },
});
