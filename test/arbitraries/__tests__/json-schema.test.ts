/* eslint-disable complexity */
/**
 * ================================================================================
 * JSON SCHEMA ARBITRARIES TESTS - FOUNDRYDATA TESTING v2.1
 *
 * Property-based tests verifying that generated schemas have no contradictions.
 * Multi-draft support with deterministic testing using fixed seed.
 * ================================================================================
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { propertyTest } from '../../setup';
import { createAjv } from '../../helpers/ajv-factory';
import {
  createBounds,
  jsonSchemaArbitraryFor,
  getSchemaArbitrary,
  simpleSchemaArbitrary,
  type JsonSchemaDraft,
} from '../json-schema';

// Fixed seed for deterministic testing as per testing guide
const FC_SEED = 424242;

describe('JSON Schema Arbitraries', () => {
  describe('createBounds helper', () => {
    test('always generates consistent bounds (min ≤ max)', () => {
      return propertyTest(
        'createBounds: consistent',
        fc.property(createBounds(-1000, 1000), ([min, max]) => {
          expect(min).toBeLessThanOrEqual(max);
          expect(typeof min).toBe('number');
          expect(typeof max).toBe('number');
        }),
        { parameters: { seed: FC_SEED } }
      );
    });

    test('respects input range', () => {
      return propertyTest(
        'createBounds: input range',
        fc.property(createBounds(10, 50), ([min, max]) => {
          expect(min).toBeGreaterThanOrEqual(10);
          expect(max).toBeLessThanOrEqual(50);
        }),
        { parameters: { seed: FC_SEED } }
      );
    });
  });

  describe('Schema validation without contradictions', () => {
    const drafts: JsonSchemaDraft[] = ['draft-07', '2019-09', '2020-12'];

    drafts.forEach((draft) => {
      test(`generates valid schemas for ${draft}`, () => {
        const ajv = createAjv(draft);

        return propertyTest(
          `schemas valid ${draft}`,
          fc.property(jsonSchemaArbitraryFor(draft), (schema) => {
            // Schema should be valid according to JSON Schema meta-schema
            const isValid = ajv.validateSchema(schema);
            if (!isValid && ajv.errors) {
              console.error(`Schema validation failed for ${draft}:`, {
                schema,
                errors: ajv.errors,
              });
            }
            expect(isValid).toBe(true);
          }),
          { parameters: { seed: FC_SEED, numRuns: 50 }, context: { draft } }
        );
      });

      test(`string schemas have consistent constraints for ${draft}`, () => {
        return propertyTest(
          `string constraints ${draft}`,
          fc.property(jsonSchemaArbitraryFor(draft), (schema) => {
            if (schema.type === 'string') {
              const minLength = schema.minLength as number | undefined;
              const maxLength = schema.maxLength as number | undefined;

              if (minLength !== undefined && maxLength !== undefined) {
                expect(minLength).toBeLessThanOrEqual(maxLength);
              }

              // If enum exists, all values should respect length constraints
              const enumValues = schema.enum as string[] | undefined;
              if (enumValues) {
                enumValues.forEach((value) => {
                  if (minLength !== undefined) {
                    expect(value.length).toBeGreaterThanOrEqual(minLength);
                  }
                  if (maxLength !== undefined) {
                    expect(value.length).toBeLessThanOrEqual(maxLength);
                  }
                });
              }

              // If const exists, it should respect length constraints
              const constValue = schema.const as string | undefined;
              if (constValue && typeof constValue === 'string') {
                if (minLength !== undefined) {
                  expect(constValue.length).toBeGreaterThanOrEqual(minLength);
                }
                if (maxLength !== undefined) {
                  expect(constValue.length).toBeLessThanOrEqual(maxLength);
                }
              }
            }
          }),
          { parameters: { seed: FC_SEED, numRuns: 100 }, context: { draft } }
        );
      });

      test(`number schemas have consistent bounds for ${draft}`, () => {
        return propertyTest(
          `number bounds ${draft}`,
          fc.property(jsonSchemaArbitraryFor(draft), (schema) => {
            if (schema.type === 'number' || schema.type === 'integer') {
              const minimum = schema.minimum as number | undefined;
              const maximum = schema.maximum as number | undefined;
              const exclusiveMinimum = schema.exclusiveMinimum as
                | number
                | undefined;
              const exclusiveMaximum = schema.exclusiveMaximum as
                | number
                | undefined;

              // Basic bounds consistency
              if (minimum !== undefined && maximum !== undefined) {
                expect(minimum).toBeLessThanOrEqual(maximum);
              }

              // Exclusive bounds should be stricter
              if (exclusiveMinimum !== undefined && minimum !== undefined) {
                expect(exclusiveMinimum).toBeLessThan(minimum);
              }
              if (exclusiveMaximum !== undefined && maximum !== undefined) {
                expect(exclusiveMaximum).toBeGreaterThan(maximum);
              }

              // Enum values should respect bounds
              const enumValues = schema.enum as number[] | undefined;
              if (enumValues) {
                enumValues.forEach((value) => {
                  if (minimum !== undefined) {
                    expect(value).toBeGreaterThanOrEqual(minimum);
                  }
                  if (maximum !== undefined) {
                    expect(value).toBeLessThanOrEqual(maximum);
                  }
                });
              }
            }
          }),
          { parameters: { seed: FC_SEED, numRuns: 100 }, context: { draft } }
        );
      });

      test(`object schemas have required ⊆ properties for ${draft}`, () => {
        return propertyTest(
          `object required ${draft}`,
          fc.property(jsonSchemaArbitraryFor(draft), (schema) => {
            if (schema.type === 'object') {
              const properties = schema.properties as
                | Record<string, unknown>
                | undefined;
              const required = schema.required as string[] | undefined;

              if (properties && required) {
                const propertyNames = Object.keys(properties);

                // Every required property must exist in properties
                required.forEach((requiredProp) => {
                  expect(propertyNames).toContain(requiredProp);
                });

                // Required should be a subset of properties
                expect(required.length).toBeLessThanOrEqual(
                  propertyNames.length
                );
              }
            }
          }),
          { parameters: { seed: FC_SEED, numRuns: 100 }, context: { draft } }
        );
      });

      test(`array schemas have consistent item constraints for ${draft}`, () => {
        return propertyTest(
          `array items ${draft}`,
          fc.property(jsonSchemaArbitraryFor(draft), (schema) => {
            if (schema.type === 'array') {
              const minItems = schema.minItems as number | undefined;
              const maxItems = schema.maxItems as number | undefined;

              if (minItems !== undefined && maxItems !== undefined) {
                expect(minItems).toBeLessThanOrEqual(maxItems);
              }

              // Verify draft-specific keywords
              if (draft === '2020-12') {
                // Should use prefixItems instead of tuple items
                const prefixItems = schema.prefixItems;
                if (prefixItems) {
                  expect(Array.isArray(prefixItems)).toBe(true);
                }
              } else {
                // Draft-07 and 2019-09 use items for tuples
                const items = schema.items;
                if (items && Array.isArray(items)) {
                  expect(items.length).toBeGreaterThan(0);
                }
              }
            }
          }),
          { parameters: { seed: FC_SEED, numRuns: 100 }, context: { draft } }
        );
      });
    });
  });

  describe('Environment-based schema generation', () => {
    test('getSchemaArbitrary uses environment SCHEMA_DRAFT', () => {
      const originalEnv = process.env.SCHEMA_DRAFT;

      try {
        process.env.SCHEMA_DRAFT = 'draft-07';
        const arbitrary = getSchemaArbitrary();

        // Verify it generates valid schemas
        return propertyTest(
          'env draft schemas valid',
          fc.property(arbitrary, (schema) => {
            expect(typeof schema).toBe('object');
            expect(schema).not.toBeNull();
          }),
          {
            parameters: { seed: FC_SEED, numRuns: 10 },
            context: { draft: process.env.SCHEMA_DRAFT },
          }
        );
      } finally {
        process.env.SCHEMA_DRAFT = originalEnv;
      }
    });

    test('getSchemaArbitrary defaults to 2020-12', () => {
      const originalEnv = process.env.SCHEMA_DRAFT;

      try {
        delete process.env.SCHEMA_DRAFT;
        const arbitrary = getSchemaArbitrary();

        return propertyTest(
          'default draft schemas valid',
          fc.property(arbitrary, (schema) => {
            expect(typeof schema).toBe('object');
          }),
          { parameters: { seed: FC_SEED, numRuns: 5 } }
        );
      } finally {
        process.env.SCHEMA_DRAFT = originalEnv;
      }
    });
  });

  describe('Simple schema arbitrary', () => {
    test('generates only basic schemas without complex combinations', () => {
      return propertyTest(
        'simpleSchemaArbitrary: basic schemas',
        fc.property(simpleSchemaArbitrary, (schema) => {
          expect(schema).toHaveProperty('type');

          // Should not have complex combinations
          expect(schema).not.toHaveProperty('allOf');
          expect(schema).not.toHaveProperty('anyOf');
          expect(schema).not.toHaveProperty('oneOf');
          expect(schema).not.toHaveProperty('not');
          expect(schema).not.toHaveProperty('if');

          // Basic types only
          const validTypes = [
            'string',
            'number',
            'integer',
            'boolean',
            'null',
            'array',
            'object',
          ];
          expect(validTypes).toContain(schema.type);
        }),
        { parameters: { seed: FC_SEED, numRuns: 50 } }
      );
    });
  });

  describe('No contradictions guarantee', () => {
    test('generated schemas never create impossible constraints', () => {
      const drafts: JsonSchemaDraft[] = ['draft-07', '2019-09', '2020-12'];

      drafts.forEach((draft) => {
        return propertyTest(
          `no contradictions ${draft}`,
          fc.property(jsonSchemaArbitraryFor(draft), (schema) => {
            // Test that we can generate valid data for any schema produced
            const ajv = createAjv(draft);
            const validate = ajv.compile(schema);

            // Schema compilation should not throw
            expect(validate).toBeDefined();
            expect(typeof validate).toBe('function');

            // Schema should be internally consistent
            // This is verified by AJV's ability to compile it without errors
            expect(ajv.errors).toBeNull();
          }),
          { parameters: { seed: FC_SEED, numRuns: 50 }, context: { draft } }
        );
      });
    });

    test('string schemas never have contradictory length constraints', () => {
      return propertyTest(
        'no contradiction: string lengths',
        fc.property(jsonSchemaArbitraryFor('draft-07'), (schema) => {
          if (schema.type === 'string') {
            const minLength = schema.minLength as number | undefined;
            const maxLength = schema.maxLength as number | undefined;

            // Explicit contradiction check: minLength should never exceed maxLength
            if (minLength !== undefined && maxLength !== undefined) {
              expect(minLength).toBeLessThanOrEqual(maxLength);
              expect(minLength).toBeGreaterThanOrEqual(0);
              expect(maxLength).toBeGreaterThanOrEqual(0);
            }
          }
        }),
        {
          parameters: { seed: FC_SEED, numRuns: 100 },
          context: { draft: 'draft-07' },
        }
      );
    });

    test('number schemas never have contradictory bound constraints', () => {
      return propertyTest(
        'no contradiction: numeric bounds',
        fc.property(jsonSchemaArbitraryFor('draft-07'), (schema) => {
          if (schema.type === 'number' || schema.type === 'integer') {
            const minimum = schema.minimum as number | undefined;
            const maximum = schema.maximum as number | undefined;

            // Explicit contradiction check: minimum should never exceed maximum
            if (minimum !== undefined && maximum !== undefined) {
              expect(minimum).toBeLessThanOrEqual(maximum);
            }

            // MultipleOf should be positive
            const multipleOf = schema.multipleOf as number | undefined;
            if (multipleOf !== undefined) {
              expect(multipleOf).toBeGreaterThan(0);
            }
          }
        }),
        {
          parameters: { seed: FC_SEED, numRuns: 100 },
          context: { draft: 'draft-07' },
        }
      );
    });

    test('array schemas never have contradictory item constraints', () => {
      return propertyTest(
        'no contradiction: array items',
        fc.property(jsonSchemaArbitraryFor('draft-07'), (schema) => {
          if (schema.type === 'array') {
            const minItems = schema.minItems as number | undefined;
            const maxItems = schema.maxItems as number | undefined;

            // Explicit contradiction check: minItems should never exceed maxItems
            if (minItems !== undefined && maxItems !== undefined) {
              expect(minItems).toBeLessThanOrEqual(maxItems);
              expect(minItems).toBeGreaterThanOrEqual(0);
              expect(maxItems).toBeGreaterThanOrEqual(0);
            }
          }
        }),
        {
          parameters: { seed: FC_SEED, numRuns: 100 },
          context: { draft: 'draft-07' },
        }
      );
    });

    test('object schemas never have impossible required properties', () => {
      return propertyTest(
        'no contradiction: object required',
        fc.property(jsonSchemaArbitraryFor('draft-07'), (schema) => {
          if (schema.type === 'object') {
            const properties = schema.properties as
              | Record<string, unknown>
              | undefined;
            const required = schema.required as string[] | undefined;

            if (properties && required) {
              const propertyNames = Object.keys(properties);

              // Explicit contradiction check: every required property must exist in properties
              required.forEach((requiredProp) => {
                expect(propertyNames).toContain(requiredProp);
              });

              // Required array should have no duplicates
              const uniqueRequired = [...new Set(required)];
              expect(required.length).toBe(uniqueRequired.length);

              // Required should be subset of properties (cardinality check)
              expect(required.length).toBeLessThanOrEqual(propertyNames.length);
            }
          }
        }),
        {
          parameters: { seed: FC_SEED, numRuns: 100 },
          context: { draft: 'draft-07' },
        }
      );
    });

    test('enum/const values always respect schema constraints', () => {
      return propertyTest(
        'values respect constraints',
        fc.property(jsonSchemaArbitraryFor('draft-07'), (schema) => {
          // Check string enum/const respects length constraints
          if (schema.type === 'string') {
            const minLength = schema.minLength as number | undefined;
            const maxLength = schema.maxLength as number | undefined;
            const enumValues = schema.enum as string[] | undefined;
            const constValue = schema.const as string | undefined;

            if (enumValues && Array.isArray(enumValues)) {
              enumValues.forEach((value) => {
                if (typeof value === 'string') {
                  if (minLength !== undefined) {
                    expect(value.length).toBeGreaterThanOrEqual(minLength);
                  }
                  if (maxLength !== undefined) {
                    expect(value.length).toBeLessThanOrEqual(maxLength);
                  }
                }
              });
            }

            if (constValue && typeof constValue === 'string') {
              if (minLength !== undefined) {
                expect(constValue.length).toBeGreaterThanOrEqual(minLength);
              }
              if (maxLength !== undefined) {
                expect(constValue.length).toBeLessThanOrEqual(maxLength);
              }
            }
          }

          // Check number enum/const respects bound constraints
          if (schema.type === 'number' || schema.type === 'integer') {
            const minimum = schema.minimum as number | undefined;
            const maximum = schema.maximum as number | undefined;
            const enumValues = schema.enum as number[] | undefined;
            const constValue = schema.const as number | undefined;

            if (enumValues && Array.isArray(enumValues)) {
              enumValues.forEach((value) => {
                if (typeof value === 'number') {
                  if (minimum !== undefined) {
                    expect(value).toBeGreaterThanOrEqual(minimum);
                  }
                  if (maximum !== undefined) {
                    expect(value).toBeLessThanOrEqual(maximum);
                  }
                }
              });
            }

            if (constValue && typeof constValue === 'number') {
              if (minimum !== undefined) {
                expect(constValue).toBeGreaterThanOrEqual(minimum);
              }
              if (maximum !== undefined) {
                expect(constValue).toBeLessThanOrEqual(maximum);
              }
            }
          }
        }),
        {
          parameters: { seed: FC_SEED, numRuns: 100 },
          context: { draft: 'draft-07' },
        }
      );
    });

    test('createBounds helper never generates contradictory bounds', () => {
      return propertyTest(
        'createBounds: never contradictory',
        fc.property(
          fc
            .tuple(
              fc.integer({ min: -1000, max: 1000 }),
              fc.integer({ min: -1000, max: 1000 })
            )
            .chain(([inputMin, inputMax]) =>
              createBounds(
                Math.min(inputMin, inputMax),
                Math.max(inputMin, inputMax)
              )
            ),
          ([min, max]) => {
            // Bounds should always be consistent regardless of input order
            expect(min).toBeLessThanOrEqual(max);
            expect(typeof min).toBe('number');
            expect(typeof max).toBe('number');
            expect(Number.isFinite(min)).toBe(true);
            expect(Number.isFinite(max)).toBe(true);
          }
        ),
        { parameters: { seed: FC_SEED, numRuns: 200 } }
      );
    });
  });
});
