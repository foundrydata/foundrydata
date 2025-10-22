import { beforeAll, afterAll } from 'vitest';

// ============================================================================
// GLOBAL SETUP AND TEARDOWN
// ============================================================================

/**
 * Global test setup - runs once before all tests
 * Configures deterministic testing environment
 */
beforeAll(async () => {
  console.log('🚀 FoundryData Testing Architecture v2.1 - Global Setup');
  console.log('================================================');

  console.log('✅ Global test setup complete');
  console.log('================================================');
});

/**
 * Global test teardown - runs once after all tests
 * Cleans up resources and provides summary
 */
afterAll(async () => {
  console.log('🏁 Global test teardown');

  console.log('✅ Global teardown complete');
});
