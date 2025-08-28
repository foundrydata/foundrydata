/**
 * Global Teardown - Vitest Global Teardown Hook
 * FoundryData Testing Architecture v2.1
 *
 * This file runs once after all test files have completed.
 * It provides cleanup and final reporting including:
 * - Performance metrics summary
 * - Memory usage analysis
 * - Test artifact cleanup
 * - Final validation report
 */

import { performance } from 'node:perf_hooks';
import { rmdir, readdir, stat } from 'node:fs/promises';

/**
 * Calculate and display performance metrics
 * Provides insights into test suite performance
 */
function displayPerformanceMetrics(): void {
  const setupStart = (globalThis as Record<string, unknown>)
    .__TEST_SETUP_START__ as number;
  const totalTime = performance.now() - (setupStart || 0);

  console.log('📊 Performance Metrics:');
  console.log('  Total test session:', `${totalTime.toFixed(2)}ms`);

  // Memory usage analysis
  if (typeof process !== 'undefined' && process.memoryUsage) {
    const memory = process.memoryUsage();
    console.log('  Memory usage:', {
      rss: `${(memory.rss / 1024 / 1024).toFixed(2)}MB`,
      heapUsed: `${(memory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
      heapTotal: `${(memory.heapTotal / 1024 / 1024).toFixed(2)}MB`,
      external: `${(memory.external / 1024 / 1024).toFixed(2)}MB`,
    });
  }

  // Performance marks analysis
  const marks = performance.getEntriesByType('mark');
  if (marks.length > 0) {
    console.log('  Performance marks:', marks.length);
  }
}

/**
 * Clean up test artifacts and temporary files
 * Removes temporary files created during testing
 */
async function cleanupTestArtifacts(): Promise<void> {
  const cleanupDirs = ['test/tmp', 'test/artifacts'];

  for (const dir of cleanupDirs) {
    try {
      const exists = await stat(dir).catch(() => null);
      if (exists?.isDirectory()) {
        const files = await readdir(dir);
        console.log(`🧹 Cleaning up ${dir}:`, files.length, 'files');

        // Only remove if it's actually our temp directory
        if (files.length > 0) {
          await rmdir(dir, { recursive: true });
        }
      }
    } catch (error) {
      console.warn(`⚠️  Could not cleanup ${dir}:`, (error as Error).message);
    }
  }
}

/**
 * Generate final test report summary
 * Provides overview of test session configuration and results
 */
function generateFinalReport(): void {
  const config =
    ((globalThis as Record<string, unknown>).__TEST_CONFIG__ as Record<
      string,
      unknown
    >) || {};

  console.log('📋 Test Session Summary:');
  console.log('========================');
  console.log('Configuration:', {
    environment: config.NODE_ENV || 'unknown',
    ci: config.CI || false,
    seed: config.TEST_SEED || 'unknown',
    numRuns: config.FC_NUM_RUNS || 'unknown',
    schemaDraft: config.SCHEMA_DRAFT || 'unknown',
    pool: config.VITEST_POOL || 'unknown',
    platform: process.platform,
    nodeVersion: process.version,
  });

  // Additional runtime information
  console.log('Runtime Info:', {
    pid: process.pid,
    uptime: `${process.uptime().toFixed(2)}s`,
    cwd: process.cwd(),
  });
}

/**
 * Validate final test environment state
 * Ensures test session completed in expected state
 */
function validateFinalState(): void {
  const warnings: string[] = [];

  // Check for memory leaks (basic heuristic)
  if (typeof process !== 'undefined' && process.memoryUsage) {
    const memory = process.memoryUsage();
    const heapUsedMB = memory.heapUsed / 1024 / 1024;

    if (heapUsedMB > 500) {
      // 500MB threshold
      warnings.push(`High memory usage: ${heapUsedMB.toFixed(2)}MB`);
    }
  }

  // Check for unclosed handles (if available) - internal Node.js API
  const processWithHandles = process as unknown as {
    _getActiveHandles?: () => unknown[];
  };
  if (typeof processWithHandles._getActiveHandles === 'function') {
    try {
      const handles = processWithHandles._getActiveHandles();
      if (handles && handles.length > 10) {
        // Reasonable threshold
        warnings.push(`Many active handles: ${handles.length}`);
      }
    } catch {
      // Ignore errors accessing internal Node.js API
    }
  }

  // Display warnings if any
  if (warnings.length > 0) {
    console.warn('⚠️  Potential Issues Detected:');
    warnings.forEach((warning) => console.warn(`   - ${warning}`));
  }
}

/**
 * Main global teardown function
 * Executed once after all test files have completed
 */
export default async function globalTeardown(): Promise<void> {
  const teardownStart = performance.now();

  console.log('🏁 FoundryData Global Test Teardown');
  console.log('====================================');

  try {
    // Step 1: Display performance metrics
    console.log('1️⃣  Analyzing performance metrics...');
    displayPerformanceMetrics();

    // Step 2: Clean up test artifacts
    console.log('2️⃣  Cleaning up test artifacts...');
    await cleanupTestArtifacts();

    // Step 3: Generate final report
    console.log('3️⃣  Generating final report...');
    generateFinalReport();

    // Step 4: Validate final state
    console.log('4️⃣  Validating final state...');
    validateFinalState();

    const teardownTime = performance.now() - teardownStart;

    console.log('✅ Global teardown complete:', {
      duration: `${teardownTime.toFixed(2)}ms`,
    });

    console.log('====================================');
    console.log('🎉 Test session finished successfully!');
  } catch (error) {
    console.error('❌ Global teardown failed:', error);
    // Don't throw - teardown failures shouldn't fail the test suite
  }
}

/**
 * Emergency cleanup function
 * Can be called manually if needed
 */
export async function emergencyCleanup(): Promise<void> {
  console.log('🚨 Emergency cleanup initiated');

  try {
    await cleanupTestArtifacts();
    console.log('✅ Emergency cleanup complete');
  } catch (error) {
    console.error('❌ Emergency cleanup failed:', error);
  }
}
