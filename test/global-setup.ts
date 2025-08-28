/**
 * Global Setup - Vitest Global Setup Hook
 * FoundryData Testing Architecture v2.1
 *
 * This file runs once before any test files are loaded.
 * It sets up the global testing environment, including:
 * - Environment variable validation
 * - Performance monitoring initialization
 * - Global error handlers
 * - Test data directory preparation
 */

import { performance } from 'node:perf_hooks';
import { mkdir } from 'node:fs/promises';

/**
 * Validate and normalize testing environment variables
 * Ensures consistent configuration across local and CI environments
 */
function validateEnvironment(): Record<string, string | number | boolean> {
  const env = {
    NODE_ENV: process.env.NODE_ENV || 'test',
    CI: process.env.CI === 'true',
    TEST_SEED: parseInt(process.env.TEST_SEED || '424242', 10),
    FC_NUM_RUNS: parseInt(
      process.env.FC_NUM_RUNS || (process.env.CI === 'true' ? '1000' : '100'),
      10
    ),
    SCHEMA_DRAFT: process.env.SCHEMA_DRAFT || 'draft-07',
    VITEST_POOL:
      process.env.VITEST_POOL ||
      (process.platform === 'win32' ? 'threads' : 'forks'),
  };

  // Validate numeric values
  if (isNaN(env.TEST_SEED)) {
    throw new Error(`Invalid TEST_SEED: ${process.env.TEST_SEED}`);
  }

  if (isNaN(env.FC_NUM_RUNS) || env.FC_NUM_RUNS < 1) {
    throw new Error(`Invalid FC_NUM_RUNS: ${process.env.FC_NUM_RUNS}`);
  }

  // Validate schema draft
  const validDrafts = ['draft-07', '2019-09', '2020-12'];
  if (!validDrafts.includes(env.SCHEMA_DRAFT)) {
    console.warn(
      `⚠️  Invalid SCHEMA_DRAFT: ${env.SCHEMA_DRAFT}, using draft-07`
    );
    env.SCHEMA_DRAFT = 'draft-07';
  }

  return env;
}

/**
 * Setup test data directories
 * Create necessary directories for test artifacts and temporary files
 */
async function setupTestDirectories(): Promise<void> {
  const dirs = ['test/fixtures', 'test/tmp', 'test/artifacts', 'coverage'];

  for (const dir of dirs) {
    try {
      await mkdir(dir, { recursive: true });
    } catch (error) {
      console.warn(`⚠️  Could not create directory ${dir}:`, error);
    }
  }
}

/**
 * Install global error handlers for better debugging
 * Captures unhandled errors during test setup
 */
function setupGlobalErrorHandlers(): void {
  const originalUnhandledRejection = process.listeners('unhandledRejection');
  const originalUncaughtException = process.listeners('uncaughtException');

  // Enhanced unhandled rejection handler
  process.removeAllListeners('unhandledRejection');
  process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Rejection during test setup:', {
      reason,
      promise,
      stack: reason instanceof Error ? reason.stack : undefined,
    });

    // Call original handlers
    originalUnhandledRejection.forEach((handler) => {
      if (typeof handler === 'function') {
        handler(reason, promise);
      }
    });
  });

  // Enhanced uncaught exception handler
  process.removeAllListeners('uncaughtException');
  process.on('uncaughtException', (error, origin) => {
    console.error('🚨 Uncaught Exception during test setup:', {
      error: error.message,
      stack: error.stack,
      origin,
    });

    // Call original handlers
    originalUncaughtException.forEach((handler) => {
      if (typeof handler === 'function') {
        handler(error, origin);
      }
    });
  });
}

/**
 * Initialize performance monitoring
 * Sets up global performance tracking for test suite analysis
 */
function setupPerformanceMonitoring(): void {
  // Mark global setup start
  performance.mark('global-setup-start');

  // Store setup start time globally
  (globalThis as any).__TEST_SETUP_START__ = performance.now();

  console.log('📊 Performance monitoring initialized');
}

/**
 * Main global setup function
 * Executed once before any test files are loaded
 */
export default async function globalSetup(): Promise<void> {
  const setupStart = performance.now();

  console.log('🌍 FoundryData Global Test Setup');
  console.log('=================================');

  try {
    // Step 1: Validate environment
    console.log('1️⃣  Validating environment...');
    const env = validateEnvironment();

    // Step 2: Setup directories
    console.log('2️⃣  Creating test directories...');
    await setupTestDirectories();

    // Step 3: Setup error handling
    console.log('3️⃣  Installing global error handlers...');
    setupGlobalErrorHandlers();

    // Step 4: Initialize performance monitoring
    console.log('4️⃣  Initializing performance monitoring...');
    setupPerformanceMonitoring();

    // Store configuration globally for access in tests
    (globalThis as any).__TEST_CONFIG__ = env;

    const setupTime = performance.now() - setupStart;

    console.log('✅ Global setup complete:', {
      duration: `${setupTime.toFixed(2)}ms`,
      environment: env.NODE_ENV,
      ci: env.CI,
      seed: env.TEST_SEED,
      numRuns: env.FC_NUM_RUNS,
      draft: env.SCHEMA_DRAFT,
      pool: env.VITEST_POOL,
    });

    console.log('=================================');
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error; // Re-throw to fail the test suite
  }
}

/**
 * Utility function to get global test configuration
 * Available to all test files after global setup
 */
export function getGlobalConfig() {
  return (globalThis as any).__TEST_CONFIG__ || {};
}
