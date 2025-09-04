/* eslint-disable max-lines */
/**
 * ================================================================================
 * CORE MATCHERS - JSON Schema & Validation
 *
 * Core custom matchers for schema validation and basic data checking.
 * Part of the FoundryData testing framework v2.1.
 * ================================================================================
 */

import {
  getAjv,
  createAjv,
  type JsonSchemaDraft,
} from '../helpers/ajv-factory';
import type { AnySchema, ErrorObject } from 'ajv';

// ================================================================================
// UTILITY FUNCTIONS
// ================================================================================

/**
 * Helper function to handle null/undefined validation
 */
const validateNullUndefined = (
  received: unknown,
  expectedFormat: string
): {
  pass: false;
  message: () => string;
  actual: unknown;
  expected: string;
} | null => {
  if (received === null) {
    return {
      pass: false,
      message: () => `Expected null to be ${expectedFormat}, but received null`,
      actual: received,
      expected: expectedFormat,
    };
  }
  if (received === undefined) {
    return {
      pass: false,
      message: () =>
        `Expected undefined to be ${expectedFormat}, but received undefined`,
      actual: received,
      expected: expectedFormat,
    };
  }
  return null;
};

/**
 * UUID validation regex (supports v1, v3, v4, v5)
 * Matches RFC 4122 format: xxxxxxxx-xxxx-Mxxx-Nxxx-xxxxxxxxxxxx
 * Where M = version digit (1-5) and N = variant digit (8,9,a,b)
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Email validation using AJV format validation for consistency
 * Uses RFC 5322 compliant validation via ajv-formats
 */
const EMAIL_SCHEMA = { type: 'string', format: 'email' } as const;

/**
 * ISO8601 datetime validation regex
 * Matches formats like: 2023-12-25T10:30:00Z, 2023-12-25T10:30:00.123Z, 2023-12-25T10:30:00+02:00
 */
const ISO8601_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;

// ================================================================================
// CORE MATCHER FUNCTIONS
// ================================================================================

/**
 * JSON Schema validation matcher using cached AJV
 *
 * Validates data against a JSON Schema using AJV with multi-draft support.
 * Uses cached AJV instances for optimal performance in test suites.
 *
 * @param received - The value to validate against the schema
 * @param schema - JSON Schema object to validate against
 * @param draft - Optional JSON Schema draft version to use.
 *                When not specified, uses the default draft-07.
 *                Supported drafts: 'draft-07', '2019-09', '2020-12'
 *
 *                Use cases for specifying draft:
 *                - Testing schemas with draft-specific features (e.g., unevaluatedProperties in 2020-12)
 *                - Validating compatibility across different schema versions
 *                - Working with API specifications that require specific drafts (OpenAPI 3.1 = 2020-12)
 *                - Format validation differences (uuid is assertive in 2019-09+ but annotative in draft-07)
 *
 * @returns Matcher result object with pass/fail status and descriptive messages
 *
 * @example
 * ```typescript
 * // Basic usage with default draft-07
 * expect(data).toMatchJsonSchema({ type: 'string' });
 *
 * // Specify draft for format assertions
 * expect('not-a-uuid').toMatchJsonSchema(
 *   { type: 'string', format: 'uuid' },
 *   '2019-09' // Will fail validation
 * );
 *
 * // Test draft-specific features
 * expect(data).toMatchJsonSchema(
 *   { type: 'object', unevaluatedProperties: false },
 *   '2020-12'
 * );
 * ```
 */
// eslint-disable-next-line max-lines-per-function -- Complex validation logic requires detailed error handling
function toMatchJsonSchema(
  received: unknown,
  schema: AnySchema,
  draft?: JsonSchemaDraft
): {
  pass: boolean;
  message: () => string;
  actual: unknown;
  expected: AnySchema;
} {
  // Validate the schema parameter first
  if (!schema || typeof schema !== 'object') {
    throw new Error(
      `Invalid schema provided to toMatchJsonSchema: expected object, got ${typeof schema}`
    );
  }

  // Additional validation for common schema structure issues
  if (Array.isArray(schema)) {
    throw new Error(
      'Invalid schema provided to toMatchJsonSchema: schema cannot be an array'
    );
  }

  const ajv = draft ? createAjv(draft) : getAjv();

  // Wrap AJV compilation in try-catch to provide better error messages
  let validate: ReturnType<typeof ajv.compile>;
  try {
    validate = ajv.compile(schema);
  } catch (compileError) {
    throw new Error(
      `Invalid schema provided to toMatchJsonSchema: ${compileError instanceof Error ? compileError.message : String(compileError)}`
    );
  }

  const isValid = validate(received);

  // Helper to truncate large objects for error messages
  const formatReceived = (value: unknown): string => {
    const stringified = JSON.stringify(value);
    if (stringified.length > 1000) {
      // Truncate large objects and add summary
      const type = Array.isArray(value)
        ? `array with ${value.length} items`
        : typeof value === 'object' && value !== null
          ? `object with ${Object.keys(value).length} properties`
          : typeof value;
      return `${stringified.substring(0, 500)}... (truncated ${type})`;
    }
    return stringified;
  };

  return {
    pass: Boolean(isValid),
    message: () => {
      if (isValid) {
        return `Expected value NOT to match schema`;
      } else {
        const errors: ErrorObject[] = validate.errors || [];
        const errorMessages = errors
          .map(
            (err: ErrorObject) =>
              `${err.instancePath || 'root'}: ${err.message}`
          )
          .join(', ');
        return `Expected value to match schema. Errors: ${errorMessages}\nReceived: ${formatReceived(received)}`;
      }
    },
    actual: received,
    expected: schema,
  };
}

/**
 * Numeric range validation matcher
 */
function toBeWithinRange(
  received: unknown,
  min: number,
  max: number
): {
  pass: boolean;
  message: () => string;
  actual: unknown;
  expected: { min: number; max: number };
} {
  const isNumber = typeof received === 'number' && !isNaN(received);
  const isInRange = isNumber && received >= min && received <= max;

  return {
    pass: isInRange,
    message: () => {
      if (!isNumber) {
        return `Expected value to be a number, but got ${typeof received}`;
      }
      return `Expected ${received} to be within range [${min}, ${max}]`;
    },
    actual: received,
    expected: { min, max },
  };
}

/**
 * UUID validation matcher (supports v1, v3, v4, v5)
 */
function toBeValidUUID(received: unknown): {
  pass: boolean;
  message: () => string;
  actual: unknown;
  expected: string;
} {
  const nullUndefinedResult = validateNullUndefined(received, 'a valid UUID');
  if (nullUndefinedResult) return nullUndefinedResult;

  const isString = typeof received === 'string';
  const isValidUUID = isString && UUID_REGEX.test(received);

  return {
    pass: isValidUUID,
    message: () => {
      if (!isString) {
        return `Expected value to be a string, but got ${typeof received}`;
      }
      return `Expected "${received}" to be a valid UUID v4`;
    },
    actual: received,
    expected: 'valid UUID v4 format',
  };
}

/**
 * Email validation matcher using AJV format validation
 */
function toBeValidEmail(received: unknown): {
  pass: boolean;
  message: () => string;
  actual: unknown;
  expected: string;
} {
  const nullUndefinedResult = validateNullUndefined(
    received,
    'a valid email address'
  );
  if (nullUndefinedResult) return nullUndefinedResult;

  if (typeof received !== 'string') {
    return {
      pass: false,
      message: () =>
        `Expected value to be a string, but got ${typeof received}`,
      actual: received,
      expected: 'valid email format',
    };
  }

  // Use AJV for consistent email validation
  const ajv = getAjv();
  const validate = ajv.compile(EMAIL_SCHEMA);
  const isValidEmail = validate(received);

  return {
    pass: Boolean(isValidEmail),
    message: () => {
      if (isValidEmail) {
        return `Expected "${received}" NOT to be a valid email address`;
      }
      const errors = validate.errors || [];
      const errorMessages = errors
        .map((err) => `${err.instancePath || 'root'}: ${err.message}`)
        .join(', ');
      return `Expected "${received}" to be a valid email address. Errors: ${errorMessages}`;
    },
    actual: received,
    expected: 'valid email format',
  };
}

/**
 * ISO8601 datetime validation matcher
 */
function toBeValidISO8601(received: unknown): {
  pass: boolean;
  message: () => string;
  actual: unknown;
  expected: string;
} {
  const nullUndefinedResult = validateNullUndefined(
    received,
    'a valid ISO8601 datetime'
  );
  if (nullUndefinedResult) return nullUndefinedResult;

  const isString = typeof received === 'string';
  const isValidISO8601 = isString && ISO8601_REGEX.test(received);

  return {
    pass: isValidISO8601,
    message: () => {
      if (!isString) {
        return `Expected value to be a string, but got ${typeof received}`;
      }
      return `Expected "${received}" to be a valid ISO8601 datetime`;
    },
    actual: received,
    expected: 'valid ISO8601 datetime format',
  };
}

/**
 * JSON validation matcher
 */
function toBeValidJSON(received: unknown): {
  pass: boolean;
  message: () => string;
  actual: unknown;
  expected: string;
} {
  const nullUndefinedResult = validateNullUndefined(
    received,
    'a valid JSON string'
  );
  if (nullUndefinedResult) return nullUndefinedResult;

  const isString = typeof received === 'string';

  if (!isString) {
    return {
      pass: false,
      message: () =>
        `Expected value to be a string, but got ${typeof received}`,
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
}

// ================================================================================
// EXPORTS
// ================================================================================

export {
  toMatchJsonSchema,
  toBeWithinRange,
  toBeValidUUID,
  toBeValidEmail,
  toBeValidISO8601,
  toBeValidJSON,
};
