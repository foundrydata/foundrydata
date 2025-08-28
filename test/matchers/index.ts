/**
 * ================================================================================
 * CUSTOM VITEST MATCHERS - FOUNDRYDATA TESTING v2.1
 *
 * Custom matchers for JSON Schema validation, compliance testing, and data generation.
 * Uses cached AJV instances and follows deterministic testing principles.
 *
 * See: docs/tests/foundrydata-complete-testing-guide-en.ts.txt
 * ================================================================================
 */

import type { JsonSchemaDraft } from '../helpers/ajv-factory.js';
import type { AnySchema } from 'ajv';

// Import matcher implementations
import './core-matchers.js';
import './advanced-matchers.js';

// ================================================================================
// INTERFACE DECLARATIONS FOR TYPESCRIPT
// ================================================================================

interface CustomMatchers<R = unknown> {
  /**
   * Assert that generated data matches JSON Schema using cached AJV validation
   * @param schema JSON Schema to validate against
   * @param draft Optional JSON Schema draft version (defaults to environment)
   */
  toMatchJsonSchema: (schema: AnySchema, draft?: JsonSchemaDraft) => R;

  /**
   * Assert that a number is within specified range (inclusive)
   * @param min Minimum value (inclusive)
   * @param max Maximum value (inclusive)
   */
  toBeWithinRange: (min: number, max: number) => R;

  /**
   * Assert compliance score meets expected threshold
   * @param expected Expected compliance percentage (0-100)
   */
  toHaveCompliance: (expected: number) => R;

  /**
   * Assert value is a valid UUID v4
   */
  toBeValidUUID: () => R;

  /**
   * Assert value is a valid email address
   */
  toBeValidEmail: () => R;

  /**
   * Assert value is a valid ISO8601 datetime
   */
  toBeValidISO8601: () => R;

  /**
   * Assert value is a valid JSON string
   */
  toBeValidJSON: () => R;

  /**
   * Assert array contains only distinct values
   * @param deep Whether to perform deep equality check for objects
   */
  toBeDistinct: (deep?: boolean) => R;

  /**
   * Assert error rate is within tolerance
   * @param expectedRate Expected error rate (0-1)
   * @param tolerance Tolerance for deviation (default: 0.05)
   */
  toHaveErrorRate: (expectedRate: number, tolerance?: number) => R;

  /**
   * Assert data was generated with specific seed (determinism check)
   * @param options Generation options with seed, schema, and generator function
   */
  toBeGeneratedWithSeed: (options: {
    seed: number;
    schema: AnySchema;
    generate: (schema: AnySchema, seed: number) => unknown;
  }) => R;
}

declare module 'vitest' {
  interface Assertion<T> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

// ================================================================================
// EXPORTS
// ================================================================================

export { type CustomMatchers };
