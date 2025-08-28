/**
 * ================================================================================
 * CORE MATCHERS - JSON Schema & Validation
 *
 * Core custom matchers for schema validation and basic data checking.
 * Part of the FoundryData testing framework v2.1.
 * ================================================================================
 */

import { expect } from 'vitest';
import {
  getAjv,
  createAjv,
  type JsonSchemaDraft,
} from '../helpers/ajv-factory.ts';
import type { AnySchema } from 'ajv';

// ================================================================================
// UTILITY FUNCTIONS
// ================================================================================

/**
 * UUID validation regex (supports v1, v3, v4, v5)
 * Matches RFC 4122 format: xxxxxxxx-xxxx-Mxxx-Nxxx-xxxxxxxxxxxx
 * Where M = version digit (1-5) and N = variant digit (8,9,a,b)
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Email validation regex (basic)
 * More comprehensive than simple @ check, less strict than full RFC 5322
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * ISO8601 datetime validation regex
 * Matches formats like: 2023-12-25T10:30:00Z, 2023-12-25T10:30:00.123Z, 2023-12-25T10:30:00+02:00
 */
const ISO8601_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;

// ================================================================================
// CORE MATCHER IMPLEMENTATIONS
// ================================================================================

expect.extend({
  /**
   * JSON Schema validation matcher using cached AJV
   */
  toMatchJsonSchema(
    received: unknown,
    schema: AnySchema,
    draft?: JsonSchemaDraft
  ) {
    const ajv = draft ? createAjv(draft) : getAjv();
    const validate = ajv.compile(schema);
    const isValid = validate(received);

    return {
      pass: Boolean(isValid),
      message: () => {
        if (isValid) {
          return `Expected ${JSON.stringify(received)} NOT to match schema`;
        } else {
          const errors = validate.errors || [];
          const errorMessages = errors
            .map((err) => `${err.instancePath || 'root'}: ${err.message}`)
            .join(', ');
          return `Expected ${JSON.stringify(received)} to match schema. Errors: ${errorMessages}`;
        }
      },
      actual: received,
      expected: schema,
    };
  },

  /**
   * Numeric range validation matcher
   */
  toBeWithinRange(received: unknown, min: number, max: number) {
    const isNumber = typeof received === 'number' && !isNaN(received);
    const isInRange = isNumber && received >= min && received <= max;

    return {
      pass: isInRange,
      message: () => {
        if (!isNumber) {
          return `Expected ${JSON.stringify(received)} to be a number, but got ${typeof received}`;
        }
        return `Expected ${received} to be within range [${min}, ${max}]`;
      },
      actual: received,
      expected: { min, max },
    };
  },

  /**
   * UUID validation matcher (supports v1, v3, v4, v5)
   */
  toBeValidUUID(received: unknown) {
    // Explicit null/undefined handling
    if (received === null) {
      return {
        pass: false,
        message: () => 'Expected null to be a valid UUID, but received null',
        actual: received,
        expected: 'valid UUID v4 format',
      };
    }

    if (received === undefined) {
      return {
        pass: false,
        message: () =>
          'Expected undefined to be a valid UUID, but received undefined',
        actual: received,
        expected: 'valid UUID v4 format',
      };
    }

    const isString = typeof received === 'string';
    const isValidUUID = isString && UUID_REGEX.test(received);

    return {
      pass: isValidUUID,
      message: () => {
        if (!isString) {
          return `Expected ${JSON.stringify(received)} to be a string, but got ${typeof received}`;
        }
        return `Expected "${received}" to be a valid UUID v4`;
      },
      actual: received,
      expected: 'valid UUID v4 format',
    };
  },

  /**
   * Email validation matcher
   */
  toBeValidEmail(received: unknown) {
    // Explicit null/undefined handling
    if (received === null) {
      return {
        pass: false,
        message: () =>
          'Expected null to be a valid email address, but received null',
        actual: received,
        expected: 'valid email format',
      };
    }

    if (received === undefined) {
      return {
        pass: false,
        message: () =>
          'Expected undefined to be a valid email address, but received undefined',
        actual: received,
        expected: 'valid email format',
      };
    }

    const isString = typeof received === 'string';
    const isValidEmail = isString && EMAIL_REGEX.test(received);

    return {
      pass: isValidEmail,
      message: () => {
        if (!isString) {
          return `Expected ${JSON.stringify(received)} to be a string, but got ${typeof received}`;
        }
        return `Expected "${received}" to be a valid email address`;
      },
      actual: received,
      expected: 'valid email format',
    };
  },

  /**
   * ISO8601 datetime validation matcher
   */
  toBeValidISO8601(received: unknown) {
    // Explicit null/undefined handling
    if (received === null) {
      return {
        pass: false,
        message: () =>
          'Expected null to be a valid ISO8601 datetime, but received null',
        actual: received,
        expected: 'valid ISO8601 datetime format',
      };
    }

    if (received === undefined) {
      return {
        pass: false,
        message: () =>
          'Expected undefined to be a valid ISO8601 datetime, but received undefined',
        actual: received,
        expected: 'valid ISO8601 datetime format',
      };
    }

    const isString = typeof received === 'string';
    const isValidISO8601 = isString && ISO8601_REGEX.test(received);

    return {
      pass: isValidISO8601,
      message: () => {
        if (!isString) {
          return `Expected ${JSON.stringify(received)} to be a string, but got ${typeof received}`;
        }
        return `Expected "${received}" to be a valid ISO8601 datetime`;
      },
      actual: received,
      expected: 'valid ISO8601 datetime format',
    };
  },

  /**
   * JSON validation matcher
   */
  toBeValidJSON(received: unknown) {
    // Explicit null/undefined handling
    if (received === null) {
      return {
        pass: false,
        message: () =>
          'Expected null to be a valid JSON string, but received null',
        actual: received,
        expected: 'valid JSON string',
      };
    }

    if (received === undefined) {
      return {
        pass: false,
        message: () =>
          'Expected undefined to be a valid JSON string, but received undefined',
        actual: received,
        expected: 'valid JSON string',
      };
    }

    const isString = typeof received === 'string';

    if (!isString) {
      return {
        pass: false,
        message: () =>
          `Expected ${JSON.stringify(received)} to be a string, but got ${typeof received}`,
        actual: received,
        expected: 'valid JSON string',
      };
    }

    try {
      JSON.parse(received);
      return {
        pass: true,
        message: () => `Expected "${received}" NOT to be valid JSON`,
        actual: received,
        expected: 'invalid JSON string',
      };
    } catch {
      return {
        pass: false,
        message: () => `Expected "${received}" to be valid JSON`,
        actual: received,
        expected: 'valid JSON string',
      };
    }
  },
});
