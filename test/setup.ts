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
import Ajv from 'ajv';
import Ajv2019 from 'ajv/dist/2019';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import addFormats2019 from 'ajv-formats-draft2019';
import { beforeAll, afterAll } from 'vitest';

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
    asyncReporter: async (report) => {
      if (report.failed) {
        console.error('❌ Fast-check property test failed:', {
          seed: report.seed,
          counterExample: report.counterexample,
          shrunkCounterExample: report.counterexamplePath,
          numRuns: report.numRuns,
          numSkips: report.numSkips,
        });
      }
    },
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
// AJV JSON SCHEMA VALIDATOR FACTORY
// ============================================================================

/**
 * Cached AJV validators by draft version
 * WeakMap provides automatic garbage collection when schemas are no longer referenced
 */
const ajvCache = new Map<string, Ajv>();
const schemaCache = new WeakMap<object, any>();

/**
 * JSON Schema draft configurations
 * Each draft has specific AJV class, format validation behaviors and vocabulary
 */
const SCHEMA_DRAFTS = {
  'draft-07': {
    AjvClass: Ajv, // Default AJV supports draft-07
    formatValidation: true,
    strictTypes: true,
    strictTuples: false, // More lenient for draft-07 compatibility
    addFormatsFunc: addFormats, // Standard ajv-formats
  },
  '2019-09': {
    AjvClass: Ajv2019, // Specific AJV class for 2019-09
    formatValidation: true,
    strictTypes: true,
    strictTuples: true,
    addFormatsFunc: addFormats2019, // Draft-2019-09 specific formats
  },
  '2020-12': {
    AjvClass: Ajv2020, // Specific AJV class for 2020-12
    formatValidation: true,
    strictTypes: true,
    strictTuples: true,
    addFormatsFunc: addFormats, // Standard ajv-formats works with 2020-12
  },
} as const;

export type SupportedDraft = keyof typeof SCHEMA_DRAFTS;

/**
 * Create and cache AJV validator for specific JSON Schema draft
 * Provides 100% schema compliance validation as testing oracle
 *
 * @param draft - JSON Schema draft version
 * @returns Configured AJV instance
 */
export function createAjvValidator(draft: SupportedDraft = 'draft-07'): Ajv {
  const cacheKey = draft;

  if (ajvCache.has(cacheKey)) {
    return ajvCache.get(cacheKey)!;
  }

  const config = SCHEMA_DRAFTS[draft];

  // Use the appropriate AJV class for the draft
  const ajv = new config.AjvClass({
    // Schema validation strictness
    strict: true,
    strictTypes: config.strictTypes,
    strictTuples: config.strictTuples,

    // Format validation behavior
    validateFormats: config.formatValidation,
    addUsedSchema: false, // Prevent automatic schema registration

    // Error reporting
    allErrors: true, // Collect all validation errors
    verbose: true, // Include schema and data in errors

    // Performance optimizations
    cache: true,
    // loadSchema disabled for testing (no async schema loading)

    // Deterministic behavior
    removeAdditional: false, // Don't modify input data
    useDefaults: false, // Don't apply default values
    coerceTypes: false, // Strict type validation
  });

  // Add format validators using the appropriate function for the draft
  config.addFormatsFunc(ajv);

  // Cache the configured instance
  ajvCache.set(cacheKey, ajv);

  console.log(`📋 AJV validator created for ${draft}:`, {
    ajvClass: config.AjvClass.name,
    strictTypes: config.strictTypes,
    formatValidation: config.formatValidation,
  });

  return ajv;
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
  createAjvValidator('draft-07');
  createAjvValidator('2019-09');
  createAjvValidator('2020-12');

  console.log('✅ Global test setup complete');
  console.log('================================================');
});

/**
 * Global test teardown - runs once after all tests
 * Cleans up resources and provides summary
 */
afterAll(async () => {
  console.log('🏁 Global test teardown');

  // Clear AJV cache to free memory
  ajvCache.clear();

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
    supportedDrafts: Object.keys(SCHEMA_DRAFTS) as SupportedDraft[],
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
