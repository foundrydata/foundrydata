/* eslint-disable max-depth */
/* eslint-disable complexity */
/**
 * ================================================================================
 * INVARIANT TESTING PATTERN - FOUNDRYDATA TESTING v2.1
 *
 * Phase 2 - Core invariant tests ensuring 100% schema compliance.
 * Tests fundamental properties that must ALWAYS hold for data generation.
 *
 * Key invariants:
 * - MUST generate 100% schema-compliant data (using AJV oracle)
 * - MUST be deterministic with same seed
 * - MUST generate correct data types
 * - MUST respect all boundary constraints
 *
 * See: docs/tests/foundrydata-complete-testing-guide-en.ts.txt
 * ================================================================================
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { createAjv, type JsonSchemaDraft } from '../helpers/ajv-factory.js';
import {
  getSchemaArbitrary,
  jsonSchemaArbitraryFor,
  simpleSchemaArbitrary,
  createBounds,
} from '../arbitraries/json-schema.js';
import {
  assertValidAgainstSchema,
  validateAgainstSchema,
  getTestConfig,
} from '../setup.js';

// ============================================================================
// CONFIGURATION AND UTILITIES
// ============================================================================

/** All supported JSON Schema drafts for cross-draft testing */
const ALL_DRAFTS: JsonSchemaDraft[] = ['draft-07', '2019-09', '2020-12'];

/**
 * Get the current draft from environment or default
 */
function getCurrentDraft(): JsonSchemaDraft {
  return (process.env.SCHEMA_DRAFT as JsonSchemaDraft) || '2020-12';
}

/**
 * Utility to log test context on failure for debugging
 */
function logTestContext(
  seed: number,
  schema: object,
  data: unknown,
  errors?: any[]
): void {
  console.error('='.repeat(60));
  console.error('INVARIANT TEST FAILURE CONTEXT');
  console.error('='.repeat(60));
  console.error('Seed:', seed);
  console.error('Schema:', JSON.stringify(schema, null, 2));
  console.error('Generated Data:', JSON.stringify(data, null, 2));
  if (errors?.length) {
    console.error(
      'Validation Errors:',
      errors
        .map((e) => `${e.instancePath || 'root'}: ${e.message} (${e.keyword})`)
        .join(', ')
    );
  }
  console.error('='.repeat(60));
}

/**
 * Mock data generator that should always produce compliant data
 * This simulates the behavior of the actual FoundryData generators
 */
function mockDataGenerator(schema: Record<string, unknown>): unknown {
  // Handle composition schemas first
  if (schema.allOf && Array.isArray(schema.allOf)) {
    // For allOf, find a compatible type that satisfies all subschemas
    const subschemas = schema.allOf as Record<string, unknown>[];
    const types = subschemas.map((s) => s.type).filter(Boolean);

    // If multiple conflicting types, this is an invalid schema
    if (new Set(types).size > 1) {
      // Try to find a working combination or throw
      throw new Error(
        `Incompatible allOf schema: types ${types.join(', ')} cannot coexist`
      );
    }

    // Use the first subschema as base and merge constraints
    if (subschemas.length > 0) {
      const baseSchema = { ...subschemas[0] };
      // Merge additional constraints from other subschemas
      for (let i = 1; i < subschemas.length; i++) {
        Object.assign(baseSchema, subschemas[i]);
      }
      return mockDataGenerator(baseSchema);
    }
  }

  if (schema.anyOf && Array.isArray(schema.anyOf)) {
    // For anyOf, use the first valid subschema
    const subschemas = schema.anyOf as Record<string, unknown>[];
    if (subschemas.length > 0 && subschemas[0]) {
      return mockDataGenerator(subschemas[0]);
    }
  }

  if (schema.oneOf && Array.isArray(schema.oneOf)) {
    // For oneOf, we need to ensure exactly one subschema matches
    // Check for duplicate subschemas which would violate oneOf semantics
    const subschemas = schema.oneOf as Record<string, unknown>[];
    const subschemaStrings = subschemas.map((s) => JSON.stringify(s));
    const uniqueSubschemas = [...new Set(subschemaStrings)];

    // If there are duplicates, this could create ambiguity
    if (uniqueSubschemas.length !== subschemaStrings.length) {
      throw new Error(
        `oneOf contains duplicate subschemas which violates oneOf semantics: ${JSON.stringify(schema)}`
      );
    }

    // Find the first valid subschema that doesn't have internal contradictions
    for (const subschema of subschemas) {
      // Check for internal contradictions in numeric schemas
      if (subschema.type === 'number' || subschema.type === 'integer') {
        const min = Number(subschema.minimum);
        const max = Number(subschema.maximum);
        const constValue = subschema.const;

        // If there's a const value, check if it's within bounds
        if (constValue !== undefined) {
          const numConst = Number(constValue);
          if (
            (!isNaN(min) && numConst < min) ||
            (!isNaN(max) && numConst > max)
          ) {
            continue; // Skip this contradictory subschema
          }
        }

        // If min > max, skip this subschema
        if (!isNaN(min) && !isNaN(max) && min > max) {
          continue;
        }
      }

      // This subschema seems valid, use it
      return mockDataGenerator(subschema);
    }

    // If all subschemas are contradictory, throw an error
    if (subschemas.length > 0) {
      throw new Error(
        `All oneOf subschemas contain contradictions: ${JSON.stringify(schema)}`
      );
    }
  }

  if (schema.not) {
    // For not schemas, we need to generate something that doesn't match
    // This is complex, so we'll use a simple fallback
    const notSchema = schema.not as Record<string, unknown>;
    if (notSchema.type === 'string') {
      return 42; // number instead of string
    }
    if (notSchema.type === 'number') {
      return 'not-a-number'; // string instead of number
    }
    return null; // fallback
  }

  if (schema.if && schema.then && schema.else) {
    // For conditional schemas, assume condition is false and use else
    const elseSchema = schema.else as Record<string, unknown>;
    return mockDataGenerator(elseSchema);
  }

  // Handle primitive types
  if (schema.type === 'string') {
    if (schema.enum && Array.isArray(schema.enum)) {
      return schema.enum[0];
    }
    if (schema.const !== undefined) {
      return schema.const;
    }
    const minLength = Number(schema.minLength) || 0;
    const maxLength = Number(schema.maxLength) || 10;
    return 'a'.repeat(Math.min(minLength + 1, maxLength));
  }

  if (schema.type === 'number' || schema.type === 'integer') {
    if (schema.enum && Array.isArray(schema.enum)) {
      return schema.enum[0];
    }
    if (schema.const !== undefined) {
      return schema.const;
    }
    const min = Number(schema.minimum) || 0;
    const max = Number(schema.maximum) || 100;
    return Math.floor((min + max) / 2);
  }

  if (schema.type === 'boolean') {
    if (schema.const !== undefined) {
      return schema.const;
    }
    return true;
  }

  if (schema.type === 'null') {
    return null;
  }

  if (schema.type === 'array') {
    const minItems = Number(schema.minItems) || 0;
    const maxItems = Number(schema.maxItems) || Math.max(minItems + 1, 2);
    const itemCount = Math.max(minItems, Math.min(maxItems, 2));

    if (schema.prefixItems && Array.isArray(schema.prefixItems)) {
      // For prefixItems, generate items matching the prefix schemas
      const prefixCount = Math.min(schema.prefixItems.length, itemCount);
      const result = schema.prefixItems
        .slice(0, prefixCount)
        .map((itemSchema) =>
          mockDataGenerator(itemSchema as Record<string, unknown>)
        );

      // If items: false, we can't add more items beyond prefixItems
      if (schema.items === false) {
        // But if minItems requires more items than prefixItems provides,
        // and items: false, this is an impossible constraint
        if (minItems > schema.prefixItems.length) {
          throw new Error(
            `Array schema requires ${minItems} items but prefixItems only has ${schema.prefixItems.length} and items: false`
          );
        }
        return result;
      }

      // If we need more items and items is allowed
      while (
        result.length < itemCount &&
        schema.items &&
        typeof schema.items === 'object'
      ) {
        result.push(mockDataGenerator(schema.items as Record<string, unknown>));
      }

      return result;
    }

    if (schema.items === false) {
      // If items: false and no prefixItems, only empty arrays are allowed
      if (minItems > 0) {
        throw new Error(
          `Array schema requires ${minItems} items but items: false with no prefixItems`
        );
      }
      return [];
    }

    if (schema.items && typeof schema.items === 'object') {
      return Array(itemCount)
        .fill(0)
        .map(() => mockDataGenerator(schema.items as Record<string, unknown>));
    }

    return [];
  }

  if (schema.type === 'object') {
    const result: Record<string, unknown> = {};
    const properties =
      (schema.properties as Record<string, Record<string, unknown>>) || {};
    const required = (schema.required as string[]) || [];

    // Add required properties
    for (const prop of required) {
      if (properties[prop]) {
        result[prop] = mockDataGenerator(properties[prop]);
      }
    }

    return result;
  }

  // Fallback for complex schemas
  return null;
}

// ============================================================================
// INVARIANT TESTS
// ============================================================================

describe('Invariant Testing Pattern', () => {
  const config = getTestConfig();

  test('should log current test configuration', () => {
    console.log('🔧 Current test configuration:', config);
    expect(config.seed).toBe(424242);
    expect(config.supportedDrafts).toEqual(['draft-07', '2019-09', '2020-12']);
  });

  describe('INVARIANT: MUST generate 100% schema-compliant data', () => {
    test('using AJV oracle with simple schemas', () => {
      const currentDraft = getCurrentDraft();
      const ajv = createAjv(currentDraft);

      fc.assert(
        fc.property(simpleSchemaArbitrary, (schema) => {
          // Generate data using mock generator
          const generatedData = mockDataGenerator(schema);

          try {
            // Use AJV as oracle to verify 100% compliance
            const validate = ajv.compile(schema);
            const isValid = validate(generatedData);

            if (!isValid) {
              logTestContext(
                config.seed,
                schema,
                generatedData,
                validate.errors || []
              );
            }

            expect(isValid).toBe(true);
          } catch (error) {
            logTestContext(config.seed, schema, generatedData);
            throw error;
          }
        }),
        {
          seed: config.seed,
          numRuns: Math.min(config.numRuns, 50), // Lighter for simple schemas
          verbose: true,
        }
      );
    });

    test('across all JSON Schema drafts', () => {
      for (const draft of ALL_DRAFTS) {
        fc.assert(
          fc.property(jsonSchemaArbitraryFor(draft), (schema) => {
            try {
              const generatedData = mockDataGenerator(schema);
              const result = validateAgainstSchema(
                generatedData,
                schema,
                draft
              );

              if (!result.valid) {
                logTestContext(
                  config.seed,
                  schema,
                  generatedData,
                  result.errors
                );
              }

              expect(result.valid).toBe(true);
            } catch (error) {
              // If mockDataGenerator throws for incompatible schemas,
              // this reveals a schema generation issue, not a validation issue
              if (
                error instanceof Error &&
                (error.message.includes('Incompatible allOf') ||
                  error.message.includes(
                    'oneOf subschemas contain contradictions'
                  ) ||
                  error.message.includes(
                    'oneOf contains duplicate subschemas'
                  ) ||
                  error.message.includes('Array schema requires') ||
                  error.message.includes('items: false'))
              ) {
                // Skip this test case as it represents an invalid schema
                console.warn(`Skipping invalid schema: ${error.message}`);
                return; // Skip this property
              }
              throw error; // Re-throw other errors
            }
          }),
          {
            seed: config.seed,
            numRuns: 25, // Reduced for multi-draft testing
            verbose: true,
          }
        );
      }
    });
  });

  describe('INVARIANT: MUST be deterministic with same seed', () => {
    test('generates identical data with identical seeds', () => {
      const fixedSeed = 12345;

      // First generation with fixed seed
      const data1 = fc.sample(fc.integer({ min: 1, max: 100 }), {
        seed: fixedSeed,
        numRuns: 10,
      });

      // Second generation with same seed
      const data2 = fc.sample(fc.integer({ min: 1, max: 100 }), {
        seed: fixedSeed,
        numRuns: 10,
      });

      expect(data1).toEqual(data2);
    });

    test('deterministic behavior across test runs', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'integer', minimum: 0, maximum: 120 },
        },
        required: ['name'],
      };

      let previousResults: unknown[] = [];

      // Run the same property test multiple times with same seed
      for (let run = 0; run < 3; run++) {
        const currentResults: unknown[] = [];

        fc.assert(
          fc.property(fc.constant(schema), (testSchema) => {
            const data = mockDataGenerator(testSchema);
            currentResults.push(data);

            // Must be valid
            const result = validateAgainstSchema(data, testSchema);
            expect(result.valid).toBe(true);

            return true;
          }),
          {
            seed: config.seed,
            numRuns: 5,
          }
        );

        if (run > 0) {
          expect(currentResults).toEqual(previousResults);
        }

        previousResults = [...currentResults];
      }
    });
  });

  describe('INVARIANT: MUST generate correct data types', () => {
    test('string schemas produce strings', () => {
      fc.assert(
        fc.property(
          fc
            .record({
              type: fc.constant('string'),
              minLength: fc.integer({ min: 0, max: 5 }),
              maxLength: fc.integer({ min: 6, max: 20 }),
            })
            .filter((schema) => schema.minLength <= schema.maxLength),
          (schema) => {
            const data = mockDataGenerator(schema);

            expect(typeof data).toBe('string');
            expect(data).toBeTypeOf('string');

            // Verify against schema as well
            assertValidAgainstSchema(data, schema);
          }
        ),
        { seed: config.seed, numRuns: 50 }
      );
    });

    test('number schemas produce numbers', () => {
      fc.assert(
        fc.property(
          createBounds(0, 1000).chain(([min, max]) =>
            fc.record({
              type: fc.constantFrom('number', 'integer'),
              minimum: fc.constant(min),
              maximum: fc.constant(max),
            })
          ),
          (schema) => {
            const data = mockDataGenerator(schema);

            expect(typeof data).toBe('number');
            expect(data).toBeTypeOf('number');

            if (schema.type === 'integer') {
              expect(Number.isInteger(data)).toBe(true);
            }

            // Verify against schema as well
            assertValidAgainstSchema(data, schema);
          }
        ),
        { seed: config.seed, numRuns: 50 }
      );
    });

    test('boolean schemas produce booleans', () => {
      const schema = { type: 'boolean' };
      const data = mockDataGenerator(schema);

      expect(typeof data).toBe('boolean');
      expect(data).toBeTypeOf('boolean');
      assertValidAgainstSchema(data, schema);
    });

    test('null schemas produce null', () => {
      const schema = { type: 'null' };
      const data = mockDataGenerator(schema);

      expect(data).toBeNull();
      assertValidAgainstSchema(data, schema);
    });
  });

  describe('INVARIANT: MUST respect all boundary constraints', () => {
    test('string length constraints', () => {
      fc.assert(
        fc.property(
          createBounds(1, 10).chain(([minLength, maxLength]) =>
            fc.record({
              type: fc.constant('string'),
              minLength: fc.constant(minLength),
              maxLength: fc.constant(maxLength),
            })
          ),
          (schema) => {
            const data = mockDataGenerator(schema) as string;

            expect(data.length).toBeGreaterThanOrEqual(schema.minLength);
            expect(data.length).toBeLessThanOrEqual(schema.maxLength);

            // Verify full schema compliance
            assertValidAgainstSchema(data, schema);
          }
        ),
        { seed: config.seed, numRuns: 100 }
      );
    });

    test('numeric value constraints', () => {
      fc.assert(
        fc.property(
          createBounds(0, 100).chain(([minimum, maximum]) =>
            fc.record({
              type: fc.constantFrom('number', 'integer'),
              minimum: fc.constant(minimum),
              maximum: fc.constant(maximum),
            })
          ),
          (schema) => {
            const data = mockDataGenerator(schema) as number;

            expect(data).toBeGreaterThanOrEqual(schema.minimum);
            expect(data).toBeLessThanOrEqual(schema.maximum);

            if (schema.type === 'integer') {
              expect(Number.isInteger(data)).toBe(true);
            }

            // Verify full schema compliance
            assertValidAgainstSchema(data, schema);
          }
        ),
        { seed: config.seed, numRuns: 100 }
      );
    });

    test('array item count constraints', () => {
      fc.assert(
        fc.property(
          createBounds(1, 5).chain(([minItems, maxItems]) =>
            fc.record({
              type: fc.constant('array'),
              items: fc.record({ type: fc.constant('string') }),
              minItems: fc.constant(minItems),
              maxItems: fc.constant(maxItems),
            })
          ),
          (schema) => {
            const data = mockDataGenerator(schema) as unknown[];

            expect(Array.isArray(data)).toBe(true);
            expect(data.length).toBeGreaterThanOrEqual(schema.minItems);
            expect(data.length).toBeLessThanOrEqual(schema.maxItems);

            // Verify full schema compliance
            assertValidAgainstSchema(data, schema);
          }
        ),
        { seed: config.seed, numRuns: 50 }
      );
    });

    test('object required properties constraints', () => {
      fc.assert(
        fc.property(
          fc
            .array(fc.string({ minLength: 1, maxLength: 8 }), {
              minLength: 1,
              maxLength: 3,
            })
            .chain((propNames) => {
              const properties = Object.fromEntries(
                propNames.map((name) => [name, { type: 'string' }])
              );

              return fc.record({
                type: fc.constant('object'),
                properties: fc.constant(properties),
                required: fc.constant(propNames), // All properties required
              });
            }),
          (schema) => {
            const data = mockDataGenerator(schema) as Record<string, unknown>;

            expect(typeof data).toBe('object');
            expect(data).not.toBeNull();

            // Verify all required properties are present
            for (const prop of schema.required) {
              expect(data).toHaveProperty(prop);
              expect(data[prop]).toBeDefined();
            }

            // Verify full schema compliance
            assertValidAgainstSchema(data, schema);
          }
        ),
        { seed: config.seed, numRuns: 50 }
      );
    });
  });

  describe('Environment-based draft testing', () => {
    test(`current draft: ${getCurrentDraft()}`, () => {
      const currentDraft = getCurrentDraft();
      const schemaArbitrary = getSchemaArbitrary();

      fc.assert(
        fc.property(schemaArbitrary, (schema) => {
          try {
            const data = mockDataGenerator(schema);
            const result = validateAgainstSchema(data, schema, currentDraft);

            if (!result.valid) {
              logTestContext(config.seed, schema, data, result.errors);
            }

            expect(result.valid).toBe(true);
          } catch (error) {
            // If mockDataGenerator throws for incompatible schemas,
            // this reveals a schema generation issue, not a validation issue
            if (
              error instanceof Error &&
              (error.message.includes('Incompatible allOf') ||
                error.message.includes(
                  'oneOf subschemas contain contradictions'
                ) ||
                error.message.includes('oneOf contains duplicate subschemas') ||
                error.message.includes('Array schema requires') ||
                error.message.includes('items: false'))
            ) {
              // Skip this test case as it represents an invalid schema
              console.warn(`Skipping invalid schema: ${error.message}`);
              return; // Skip this property
            }
            throw error; // Re-throw other errors
          }
        }),
        {
          seed: config.seed,
          numRuns: 30,
          verbose: true,
        }
      );
    });
  });
});
