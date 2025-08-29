/**
 * Global Test Configuration Setup
 * FoundryData Testing Architecture v2.1
 *
 * This file provides deterministic test configuration across all testing frameworks:
 * - Fast-check property-based testing configuration
 * - AJV JSON Schema validation setup for multiple drafts
 * - Environment-based configuration for local vs CI testing
 * - Consistent seed management for reproducible tests
 *
 * Key Features:
 * - Fixed seed (424242) for deterministic property testing
 * - Environment-driven numRuns scaling
 * - Multi-draft JSON Schema validator factory
 * - Global error handling and logging
 */

import fc from 'fast-check';
import { beforeAll, afterAll } from 'vitest';
import { createAjv, type JsonSchemaDraft } from './helpers/ajv-factory';

// ============================================================================
// CONSTANTS AND CONFIGURATION
// ============================================================================

/** Fixed seed for deterministic property-based testing */
export const TEST_SEED = 424242;

/** Default number of property test runs (can be overridden by environment) */
export const DEFAULT_NUM_RUNS = 100;

/** CI number of property test runs for more thorough testing */
export const CI_NUM_RUNS = 1000;

/** Environment-based configuration */
const isCI = process.env.CI === 'true';
const testSeed = parseInt(process.env.TEST_SEED || String(TEST_SEED), 10);
const numRuns = parseInt(
  process.env.FC_NUM_RUNS || String(isCI ? CI_NUM_RUNS : DEFAULT_NUM_RUNS),
  10
);

// ============================================================================
// FAST-CHECK GLOBAL CONFIGURATION
// ============================================================================

/**
 * Configure fast-check with deterministic settings
 * This ensures all property-based tests are reproducible and consistent
 */
export function configureFastCheck(): void {
  fc.configureGlobal({
    seed: testSeed,
    numRuns,
    verbose: process.env.NODE_ENV === 'development' ? 2 : 1,
    // Disable asyncReporter to allow synchronous fc.assert() usage
    asyncReporter: undefined,
  });

  // Log configuration for debugging
  console.log('🔧 Fast-check configured:', {
    seed: testSeed,
    numRuns,
    isCI,
    environment: process.env.NODE_ENV || 'test',
  });
}

// ============================================================================
// AJV JSON SCHEMA VALIDATOR FACTORY (UNIFIED WITH ajv-factory.ts)
// ============================================================================

/**
 * Schema cache for compiled validators
 * WeakMap provides automatic garbage collection when schemas are no longer referenced
 */
const schemaCache = new WeakMap<object, any>();

export type SupportedDraft = JsonSchemaDraft;

/**
 * Create AJV validator using unified ajv-factory system
 * Provides 100% schema compliance validation as testing oracle
 *
 * @param draft - JSON Schema draft version
 * @returns Configured AJV instance
 */
export function createAjvValidator(draft: SupportedDraft = 'draft-07') {
  return createAjv(draft);
}

/**
 * Compile and cache schema validator function
 * Uses WeakMap for automatic cleanup when schema objects are garbage collected
 *
 * @param schema - JSON Schema object
 * @param draft - JSON Schema draft version
 * @returns Compiled validator function
 */
export function compileSchema(
  schema: object,
  draft: SupportedDraft = 'draft-07'
) {
  const cacheKey = `${JSON.stringify(schema)}-${draft}`;

  if (schemaCache.has(schema)) {
    const cached = schemaCache.get(schema);
    if (cached && cached[cacheKey]) {
      return cached[cacheKey];
    }
  }

  const ajv = createAjvValidator(draft);
  const validate = ajv.compile(schema);

  // Store in WeakMap for automatic cleanup
  const existing = schemaCache.get(schema) || {};
  existing[cacheKey] = validate;
  schemaCache.set(schema, existing);

  return validate;
}

/**
 * Validate data against schema using cached validator
 * Primary oracle function for ensuring 100% JSON Schema compliance
 *
 * @param data - Data to validate
 * @param schema - JSON Schema object
 * @param draft - JSON Schema draft version
 * @returns Validation result with detailed error information
 */
export function validateAgainstSchema(
  data: unknown,
  schema: object,
  draft: SupportedDraft = 'draft-07'
) {
  const validate = compileSchema(schema, draft);
  const valid = validate(data);

  return {
    valid,
    errors: validate.errors || [],
    schema,
    data,
    draft,
  };
}

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

  // Configure fast-check for deterministic property testing
  configureFastCheck();

  // Pre-warm AJV validators for common drafts
  console.log('🔥 Pre-warming AJV validators...');
  createAjv('draft-07');
  createAjv('2019-09');
  createAjv('2020-12');

  console.log('✅ Global test setup complete');
  console.log('================================================');
});

/**
 * Global test teardown - runs once after all tests
 * Cleans up resources and provides summary
 */
afterAll(async () => {
  console.log('🏁 Global test teardown');

  // Display final test configuration summary
  console.log('📊 Test session summary:', {
    seed: testSeed,
    numRuns,
    isCI,
    ajvValidators: ['draft-07', '2019-09', '2020-12'],
  });

  console.log('✅ Global teardown complete');
});

// ============================================================================
// UTILITY FUNCTIONS FOR TEST AUTHORS
// ============================================================================

/**
 * Get current test configuration for debugging
 * Useful for test authors to understand the current setup
 */
export function getTestConfig() {
  return {
    seed: testSeed,
    numRuns,
    isCI,
    environment: process.env.NODE_ENV || 'test',
    supportedDrafts: ['draft-07', '2019-09', '2020-12'] as SupportedDraft[],
  };
}

/**
 * Create deterministic arbitrary with current seed
 * Convenience function for fast-check test authors
 *
 * @param arbitrary - Fast-check arbitrary
 * @returns Seeded arbitrary
 */
export function seeded<T>(arbitrary: fc.Arbitrary<T>): fc.Arbitrary<T> {
  return arbitrary;
}

/**
 * Assert that generated data is valid according to schema
 * Main testing utility for validation across all generators
 *
 * @param data - Generated data
 * @param schema - JSON Schema
 * @param draft - Schema draft version
 * @param message - Custom error message
 */
export function assertValidAgainstSchema(
  data: unknown,
  schema: object,
  draft: SupportedDraft = 'draft-07',
  message?: string
) {
  const result = validateAgainstSchema(data, schema, draft);

  if (!result.valid) {
    const errorMessage =
      message || 'Generated data does not comply with schema';
    const errorDetails = result.errors
      .map(
        (err: any) =>
          `${err.instancePath || 'root'}: ${err.message} (${err.keyword})`
      )
      .join(', ');

    throw new Error(
      `${errorMessage}\nErrors: ${errorDetails}\nData: ${JSON.stringify(data)}`
    );
  }
}

// Note: All exports are already declared inline above
