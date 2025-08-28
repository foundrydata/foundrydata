/**
 * ================================================================================
 * ADVANCED MATCHERS - Compliance, Distinctness & Determinism
 *
 * Advanced custom matchers for compliance testing and data analysis.
 * Part of the FoundryData testing framework v2.1.
 * ================================================================================
 */

import { expect } from 'vitest';
import type { AnySchema } from 'ajv';

// ================================================================================
// UTILITY FUNCTIONS
// ================================================================================

/**
 * Stable stringify for deep equality checks
 * Ensures consistent JSON representation for deduplication
 */
function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']';
  }

  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map(
    (key) =>
      `"${key}":${stableStringify((obj as Record<string, unknown>)[key])}`
  );
  return '{' + pairs.join(',') + '}';
}

/**
 * Generate data twice with same seed for determinism validation
 */
function generateTwice(
  schema: AnySchema,
  seed: number,
  generate: (schema: AnySchema, seed: number, options?: unknown) => unknown,
  generateOptions?: unknown
): { generated1: unknown; generated2: unknown } {
  const generated1 = generate(schema, seed, generateOptions);
  const generated2 = generate(schema, seed, generateOptions);
  return { generated1, generated2 };
}

/**
 * Validate deterministic generation and match against received data
 */
function validateDeterministicGeneration(
  received: unknown,
  generated1: unknown,
  generated2: unknown,
  seed: number
): {
  pass: boolean;
  message: () => string;
  actual: unknown;
  expected: unknown;
} {
  const receivedStr = stableStringify(received);
  const generated1Str = stableStringify(generated1);
  const generated2Str = stableStringify(generated2);

  const matchesGenerated = receivedStr === generated1Str;
  const isDeterministic = generated1Str === generated2Str;

  return {
    pass: matchesGenerated && isDeterministic,
    message: () => {
      if (!isDeterministic) {
        return `Generation is not deterministic with seed ${seed}. Got different results: ${generated1Str} vs ${generated2Str}`;
      }
      if (!matchesGenerated) {
        return `Expected data to match generated data with seed ${seed}. Expected: ${generated1Str}, Got: ${receivedStr}`;
      }
      return `Data matches generated data and is deterministic with seed ${seed}`;
    },
    actual: received,
    expected: generated1,
  };
}

/**
 * Validate error statistics object format
 */
function validateErrorStats(errorObj: {
  errors: unknown;
  total: unknown;
}): string | null {
  if (
    typeof errorObj.errors !== 'number' ||
    typeof errorObj.total !== 'number'
  ) {
    return `Expected {errors, total} to be numbers, but got {errors: ${typeof errorObj.errors}, total: ${typeof errorObj.total}}`;
  }
  if (errorObj.total === 0) {
    return 'Cannot calculate error rate when total is 0';
  }
  return null;
}

/**
 * Create error rate validation result for statistics object
 */
function validateErrorStatsRate(
  errorObj: { errors: number; total: number },
  expectedRate: number,
  tolerance: number
): { pass: boolean; message: () => string } {
  const actualRate = errorObj.errors / errorObj.total;
  const deviation = Math.abs(actualRate - expectedRate);
  const withinTolerance = deviation <= tolerance;

  return {
    pass: withinTolerance,
    message: () => {
      return `Expected error rate ${actualRate} (${errorObj.errors}/${errorObj.total}) to be within ${tolerance} of ${expectedRate} (actual deviation: ${deviation})`;
    },
  };
}

// ================================================================================
// ADVANCED MATCHER IMPLEMENTATIONS
// ================================================================================

expect.extend({
  /**
   * Compliance score validation matcher
   */
  toHaveCompliance(received: unknown, expected: number) {
    const isValid =
      typeof received === 'number' &&
      received >= 0 &&
      received <= 100 &&
      received >= expected;

    return {
      pass: isValid,
      message: () => {
        if (typeof received !== 'number') {
          return `Expected compliance score to be a number, but got ${typeof received}`;
        }
        if (received < 0 || received > 100) {
          return `Expected compliance score to be between 0-100, but got ${received}`;
        }
        return `Expected compliance score ${received}% to be at least ${expected}%`;
      },
      actual: received,
      expected: `>= ${expected}%`,
    };
  },

  /**
   * Array distinctness validation matcher
   */
  toBeDistinct(received: unknown, deep = false) {
    if (!Array.isArray(received)) {
      return {
        pass: false,
        message: () =>
          `Expected ${JSON.stringify(received)} to be an array, but got ${typeof received}`,
        actual: received,
        expected: 'array',
      };
    }

    const seen = new Set<string>();
    const duplicates: unknown[] = [];

    for (const item of received) {
      const key = deep
        ? stableStringify(item)
        : `${typeof item}:${String(item)}`;
      if (seen.has(key)) {
        duplicates.push(item);
      } else {
        seen.add(key);
      }
    }

    const isDistinct = duplicates.length === 0;

    return {
      pass: isDistinct,
      message: () => {
        if (isDistinct) {
          return `Expected array to have duplicate values, but all values were distinct`;
        } else {
          return `Expected array to have distinct values, but found duplicates: ${JSON.stringify(duplicates)}`;
        }
      },
      actual: received,
      expected: 'array with distinct values',
    };
  },

  /**
   * Error rate validation matcher (flexible API)
   */
  toHaveErrorRate(received: unknown, expectedRate: number, tolerance = 0.05) {
    // Handle object format {errors, total}
    if (
      received &&
      typeof received === 'object' &&
      'errors' in received &&
      'total' in received
    ) {
      const errorObj = received as { errors: unknown; total: unknown };
      const validationError = validateErrorStats(errorObj);

      if (validationError) {
        return {
          pass: false,
          message: () => validationError,
          actual: received,
          expected: 'object with numeric errors and total > 0',
        };
      }

      const result = validateErrorStatsRate(
        errorObj as { errors: number; total: number },
        expectedRate,
        tolerance
      );
      return {
        ...result,
        actual: received,
        expected: `${expectedRate} ± ${tolerance}`,
      };
    }

    // Handle simple number format (0-1)
    if (typeof received !== 'number' || received < 0 || received > 1) {
      return {
        pass: false,
        message: () =>
          `Expected error rate to be a number between 0-1 or {errors, total} object, but got ${JSON.stringify(received)}`,
        actual: received,
        expected: 'number between 0-1 or {errors, total} object',
      };
    }

    const deviation = Math.abs(received - expectedRate);
    const withinTolerance = deviation <= tolerance;

    return {
      pass: withinTolerance,
      message: () =>
        `Expected error rate ${received} to be within ${tolerance} of ${expectedRate} (actual deviation: ${deviation})`,
      actual: received,
      expected: `${expectedRate} ± ${tolerance}`,
    };
  },

  /**
   * Deterministic generation validation matcher (flexible API)
   */
  toBeGeneratedWithSeed(
    received: unknown,
    options: {
      seed: number;
      schema: AnySchema;
      generate: (schema: AnySchema, seed: number, options?: unknown) => unknown;
      generateOptions?: unknown;
    }
  ) {
    const { seed, schema, generate, generateOptions } = options;

    try {
      const { generated1, generated2 } = generateTwice(
        schema,
        seed,
        generate,
        generateOptions
      );
      return validateDeterministicGeneration(
        received,
        generated1,
        generated2,
        seed
      );
    } catch (error) {
      return {
        pass: false,
        message: () => `Failed to generate data with seed ${seed}: ${error}`,
        actual: received,
        expected: 'successfully generated data',
      };
    }
  },
});
