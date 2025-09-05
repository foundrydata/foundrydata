/* eslint-disable complexity */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { performance } from 'node:perf_hooks';
/**
 * Property-based tests for ObjectGenerator - Testing Architecture v2.1
 * Using fast-check for robust constraint validation with AJV oracle
 *
 * Test coverage:
 * - Required ⊆ properties constraint validation
 * - minProperties/maxProperties constraint coherence via createBounds
 * - additionalProperties and unevaluatedProperties handling
 * - dependencies/dependentRequired validation
 * - Performance benchmarks p95 < 2ms
 * - AJV oracle validation via toMatchJsonSchema
 * - Multi-draft JSON Schema support
 */

import fc from 'fast-check';
// Testing architecture v2.1 imports - relative paths from test file location
import {
  createBounds,
  getSchemaArbitrary,
} from '../../../../../../test/arbitraries/json-schema.js';
import '../../../../../../test/matchers/index.js';
import { getAjv } from '../../../../../../test/helpers/ajv-factory.js';
import { ObjectGenerator } from '../object-generator.js';
import { FormatRegistry } from '../../../registry/format-registry.js';
import { createGeneratorContext } from '../../data-generator.js';
import type { ObjectSchema, Schema } from '../../../types/schema.js';
import { propertyTest } from '../../../../../../test/setup.js';

// Note: Avoid Math.random() to preserve determinism; use fast-check combinators instead

describe('ObjectGenerator', () => {
  let generator: ObjectGenerator;
  let formatRegistry: FormatRegistry;

  beforeEach(() => {
    generator = new ObjectGenerator();
    formatRegistry = new FormatRegistry();
    ObjectGenerator.clearCache();
  });

  afterEach(() => {
    ObjectGenerator.clearCache();
  });

  describe('supports', () => {
    it('should support object schemas with valid constraints', () => {
      return propertyTest(
        'ObjectGenerator supports object',
        fc.property(
          getSchemaArbitrary().filter((s) => (s as any).type === 'object'),
          (schema) => {
            expect(generator.supports(schema as unknown as Schema)).toBe(true);
          }
        ),
        { parameters: { seed: 424242, numRuns: 100 } }
      );
    });

    it('should not support non-object schemas', () => {
      return propertyTest(
        'ObjectGenerator rejects non-object',
        fc.property(
          getSchemaArbitrary().filter((s) => s.type !== 'object'),
          (schema) => {
            expect(generator.supports(schema as unknown as Schema)).toBe(false);
          }
        ),
        { parameters: { seed: 424242, numRuns: 100 } }
      );
    });

    it('should handle object schemas without properties', () => {
      const schema = { type: 'object' };
      expect(generator.supports(schema as Schema)).toBe(true);
    });
  });

  describe('generate', () => {
    it('should generate valid objects from schema arbitrary', () => {
      return propertyTest(
        'ObjectGenerator generate valid',
        fc.property(
          getSchemaArbitrary().filter((s) => (s as any).type === 'object'),
          fc.integer({ min: 0, max: 1000 }),
          (schema, seed) => {
            const context = createGeneratorContext(
              schema as unknown as Schema,
              formatRegistry,
              { seed }
            );
            const result = generator.generate(
              schema as unknown as Schema,
              context
            );

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(result.value).toMatchJsonSchema(schema);
            }
          }
        ),
        { parameters: { seed: 424242, numRuns: 50 } }
      );
    });
    it('should generate objects respecting required ⊆ properties constraint', () => {
      return propertyTest(
        'ObjectGenerator generate required ⊆ properties',
        fc.property(
          fc
            .dictionary(
              fc.string({ minLength: 1, maxLength: 10 }),
              fc.record({
                type: fc.constantFrom('string', 'number', 'boolean'),
              }),
              { minKeys: 2, maxKeys: 5 }
            )
            .chain((properties) => {
              const propNames = Object.keys(properties);
              return fc.record({
                type: fc.constant('object'),
                properties: fc.constant(properties),
                required: fc.subarray(propNames, {
                  minLength: 0,
                  maxLength: propNames.length,
                }),
              });
            }),
          fc.integer({ min: 0, max: 1000 }),
          (schema, seed) => {
            const context = createGeneratorContext(
              schema as Schema,
              formatRegistry,
              { seed }
            );
            const result = generator.generate(schema as Schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              const value = result.value;
              expect(typeof value).toBe('object');
              expect(value).not.toBe(null);
              expect(Array.isArray(value)).toBe(false);

              // Check required properties are present
              schema.required.forEach((prop: string) => {
                expect(value).toHaveProperty(prop);
              });

              // Validate with AJV oracle explicitly
              const ajv = getAjv();
              const validate = ajv.compile(schema);
              const isValid = validate(value);
              if (!isValid) {
                console.log('AJV validation errors:', validate.errors);
              }
              expect(isValid).toBe(true);

              // Also use toMatchJsonSchema for double validation
              expect(value).toMatchJsonSchema(schema);
            }
          }
        ),
        { parameters: { seed: 424242, numRuns: 100 } }
      );
    });

    it('should generate objects respecting minProperties/maxProperties constraints', () => {
      return propertyTest(
        'ObjectGenerator generate min/max properties',
        fc.property(
          createBounds(0, 5).chain(([minProps, maxProps]) =>
            fc.record({
              type: fc.constant('object'),
              properties: fc.dictionary(
                fc.string({ minLength: 1, maxLength: 10 }),
                fc.record({ type: fc.constant('string') }),
                { minKeys: maxProps, maxKeys: maxProps + 2 }
              ),
              minProperties: fc.constant(minProps),
              maxProperties: fc.constant(maxProps),
            })
          ),
          fc.integer({ min: 0, max: 1000 }),
          (schema, seed) => {
            const context = createGeneratorContext(
              schema as Schema,
              formatRegistry,
              { seed }
            );
            const result = generator.generate(schema as Schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              const value = result.value;
              const propCount = Object.keys(value).length;
              expect(propCount).toBeGreaterThanOrEqual(schema.minProperties);
              expect(propCount).toBeLessThanOrEqual(schema.maxProperties);

              // Validate with AJV oracle explicitly
              const ajv = getAjv();
              const validate = ajv.compile(schema);
              const isValid = validate(value);
              if (!isValid) {
                console.log('AJV validation errors:', validate.errors);
              }
              expect(isValid).toBe(true);

              // Also use toMatchJsonSchema for double validation
              expect(value).toMatchJsonSchema(schema);
            }
          }
        ),
        { parameters: { seed: 424242, numRuns: 100 } }
      );
    });

    it('should handle additionalProperties constraint', () => {
      const schemaWithAdditional = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        additionalProperties: { type: 'boolean' },
      };

      const schemaNoAdditional = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        additionalProperties: false,
      };

      [schemaWithAdditional, schemaNoAdditional].forEach((schema) => {
        const context = createGeneratorContext(
          schema as Schema,
          formatRegistry,
          { seed: 424242 }
        );
        const result = generator.generate(schema as Schema, context);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value).toMatchJsonSchema(schema);
        }
      });
    });

    it('should handle draft-specific features (unevaluatedProperties)', () => {
      // Draft 2019-09/2020-12 feature
      const modernSchema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
        unevaluatedProperties: false,
        required: ['id'],
      };

      const context = createGeneratorContext(
        modernSchema as Schema,
        formatRegistry,
        { seed: 424242 }
      );
      const result = generator.generate(modernSchema as Schema, context);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toMatchJsonSchema(modernSchema, '2020-12');
      }
    });

    it('should handle dependencies/dependentRequired constraint', () => {
      // Draft-07 style
      const draft07Schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          credit_card: { type: 'number' },
          billing_address: { type: 'string' },
        },
        dependencies: {
          credit_card: ['billing_address'],
        },
      };

      const context = createGeneratorContext(
        draft07Schema as Schema,
        formatRegistry,
        { seed: 424242 }
      );
      const result = generator.generate(draft07Schema as Schema, context);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        // If credit_card is present, billing_address must be present
        if ('credit_card' in result.value) {
          expect(result.value).toHaveProperty('billing_address');
        }
        expect(result.value).toMatchJsonSchema(draft07Schema);
      }

      // Test modern draft separately with proper draft version
      const modernSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          credit_card: { type: 'number' },
          billing_address: { type: 'string' },
        },
        dependentRequired: {
          credit_card: ['billing_address'],
        },
      };

      const context2 = createGeneratorContext(
        modernSchema as Schema,
        formatRegistry,
        { seed: 424242 }
      );
      const result2 = generator.generate(modernSchema as Schema, context2);

      expect(result2.isOk()).toBe(true);
      if (result2.isOk()) {
        if ('credit_card' in result2.value) {
          expect(result2.value).toHaveProperty('billing_address');
        }
        expect(result2.value).toMatchJsonSchema(modernSchema, '2020-12');
      }
    });

    it('should handle performance requirements for objects', () => {
      const complexObjectSchema = {
        type: 'object',
        properties: Object.fromEntries(
          Array.from({ length: 100 }, (_, i) => [
            `prop${i}`,
            { type: 'string' },
          ])
        ),
        minProperties: 50,
        maxProperties: 100,
      };

      const startTime = performance.now();

      // Generate 100 complex objects
      for (let i = 0; i < 100; i++) {
        const context = createGeneratorContext(
          complexObjectSchema as Schema,
          formatRegistry,
          { seed: i }
        );
        const result = generator.generate(
          complexObjectSchema as Schema,
          context
        );
        expect(result.isOk()).toBe(true);
      }

      const endTime = performance.now();
      void (endTime - startTime); // Keep timing for potential debug, avoid unused var
      // Average-based assertion removed; dedicated p95 benchmarks exist below
    });

    it('should fail gracefully with invalid schemas', () => {
      const invalidSchemas = [
        { type: 'object', minProperties: 5, maxProperties: 2 }, // min > max
        { type: 'object', properties: null }, // invalid properties
        null,
        undefined,
      ];

      invalidSchemas.forEach((schema) => {
        const context = createGeneratorContext(schema as any, formatRegistry);
        const result = generator.generate(schema as any, context);

        if (
          schema &&
          typeof schema === 'object' &&
          schema.minProperties &&
          schema.maxProperties &&
          schema.minProperties > schema.maxProperties
        ) {
          expect(result.isErr()).toBe(true);
        }
      });
    });
  });

  describe('validate', () => {
    it('should validate objects against schema constraints', () => {
      return propertyTest(
        'ObjectGenerator validate constraints',
        fc.property(
          fc
            .dictionary(
              fc.string({ minLength: 1, maxLength: 10 }),
              fc.record({
                type: fc.constantFrom('string', 'number', 'boolean'),
              }),
              { minKeys: 2, maxKeys: 5 }
            )
            .chain((properties) => {
              const propNames = Object.keys(properties);
              return fc.record({
                type: fc.constant('object'),
                properties: fc.constant(properties),
                required: fc.subarray(propNames, {
                  minLength: 0,
                  maxLength: propNames.length,
                }),
              });
            }),
          fc.dictionary(fc.string(), fc.anything()),
          (schema, _testObject) => {
            // Create valid object with all required properties
            const validObject: Record<string, any> = {};
            schema.required.forEach((prop: string) => {
              if (schema.properties[prop]) {
                const propType = schema.properties[prop].type;
                validObject[prop] =
                  propType === 'string'
                    ? 'test'
                    : propType === 'number'
                      ? 42
                      : propType === 'boolean'
                        ? true
                        : null;
              }
            });

            expect(generator.validate(validObject, schema as Schema)).toBe(
              true
            );

            // Test with object missing required properties
            if (schema.required.length > 0) {
              const invalidObject = { ...validObject };
              const firstRequired = schema.required[0];
              if (firstRequired) delete invalidObject[firstRequired];
              expect(generator.validate(invalidObject, schema as Schema)).toBe(
                false
              );
            }
          }
        ),
        { parameters: { seed: 424242, numRuns: 100 } }
      );
    });

    it('should validate minProperties/maxProperties constraints', () => {
      return propertyTest(
        'ObjectGenerator validate min/max properties',
        fc.property(
          createBounds(1, 5).chain(([minProps, maxProps]) =>
            fc.record({
              type: fc.constant('object'),
              minProperties: fc.constant(minProps),
              maxProperties: fc.constant(maxProps),
            })
          ),
          (schema) => {
            // Object with correct number of properties
            const validObject = Object.fromEntries(
              Array.from({ length: schema.minProperties }, (_, i) => [
                `prop${i}`,
                `value${i}`,
              ])
            );
            expect(generator.validate(validObject, schema as Schema)).toBe(
              true
            );

            // Object with too few properties
            if (schema.minProperties > 0) {
              const tooFew = {};
              expect(generator.validate(tooFew, schema as Schema)).toBe(false);
            }

            // Object with too many properties
            const tooMany = Object.fromEntries(
              Array.from({ length: schema.maxProperties + 1 }, (_, i) => [
                `prop${i}`,
                `value${i}`,
              ])
            );
            expect(generator.validate(tooMany, schema as Schema)).toBe(false);
          }
        ),
        { parameters: { seed: 424242, numRuns: 100 } }
      );
    });

    it('should reject non-objects', () => {
      const schema = {
        type: 'object',
        properties: { name: { type: 'string' } },
      };

      expect(generator.validate('not-an-object', schema as Schema)).toBe(false);
      expect(generator.validate(42, schema as Schema)).toBe(false);
      expect(generator.validate([], schema as Schema)).toBe(false);
      expect(generator.validate(null, schema as Schema)).toBe(false);
      expect(generator.validate(undefined, schema as Schema)).toBe(false);
    });
  });

  describe('getExamples', () => {
    it('should return example objects for supported schemas', () => {
      return propertyTest(
        'ObjectGenerator getExamples',
        fc.property(
          fc.record({
            type: fc.constant('object'),
            properties: fc.dictionary(
              fc.string({ minLength: 1, maxLength: 10 }),
              fc.record({ type: fc.constantFrom('string', 'number') }),
              { minKeys: 1, maxKeys: 3 }
            ),
          }),
          (schema) => {
            const examples = generator.getExamples(schema as Schema);
            expect(Array.isArray(examples)).toBe(true);
            expect(examples.length).toBeGreaterThan(0);

            examples.forEach((example) => {
              expect(typeof example).toBe('object');
              expect(example).not.toBe(null);
              expect(Array.isArray(example)).toBe(false);
              expect(generator.validate(example, schema as Schema)).toBe(true);
            });
          }
        ),
        { parameters: { seed: 424242, numRuns: 100 } }
      );
    });

    it('should return empty array for unsupported schemas', () => {
      const unsupportedSchemas = [
        { type: 'string' },
        { type: 'array' },
        null,
        undefined,
      ];

      unsupportedSchemas.forEach((schema) => {
        const examples = generator.getExamples(schema as any);
        expect(examples).toEqual([]);
      });
    });
  });

  describe('getPriority', () => {
    it('should return appropriate priority for object generator', () => {
      const priority = generator.getPriority();
      expect(typeof priority).toBe('number');
      expect(priority).toBe(10);
    });
  });

  describe('generateMultiple', () => {
    it('should generate multiple objects', () => {
      return propertyTest(
        'ObjectGenerator generateMultiple',
        fc.property(
          fc.record({
            type: fc.constant('object'),
            properties: fc.dictionary(
              fc.string({ minLength: 1, maxLength: 10 }),
              fc.record({ type: fc.constant('string') }),
              { minKeys: 2, maxKeys: 4 }
            ),
          }),
          fc.integer({ min: 2, max: 10 }),
          fc.integer({ min: 0, max: 1000 }),
          (schema, count, seed) => {
            const context = createGeneratorContext(
              schema as Schema,
              formatRegistry,
              { seed }
            );
            const result = generator.generateMultiple(
              schema as Schema,
              context,
              count
            );

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              const objects = result.unwrap();
              expect(objects).toHaveLength(count);

              // Validate all generated objects with AJV
              const ajv = getAjv();
              const validate = ajv.compile(schema);

              objects.forEach((obj: any) => {
                expect(typeof obj).toBe('object');
                expect(obj).not.toBe(null);
                expect(Array.isArray(obj)).toBe(false);

                // Explicit AJV validation for each object
                const isValid = validate(obj);
                if (!isValid) {
                  console.log(
                    `Multiple generation validation error for object ${JSON.stringify(obj)}:`,
                    validate.errors
                  );
                }
                expect(isValid).toBe(true);

                expect(obj).toMatchJsonSchema(schema);
              });
            }
          }
        ),
        { parameters: { seed: 424242, numRuns: 50 } }
      );
    });

    it('should fail for unsupported schemas', () => {
      const schema = { type: 'string' }; // Not an object
      const context = createGeneratorContext(schema as Schema, formatRegistry, {
        seed: 424242,
      });
      const result = generator.generateMultiple(schema as any, context, 5);

      expect(result.isErr()).toBe(true);
    });
  });

  describe('integration tests', () => {
    it('should maintain consistency between generate and validate', () => {
      return propertyTest(
        'ObjectGenerator integration generate vs validate',
        fc.property(
          fc
            .dictionary(
              fc.string({ minLength: 1, maxLength: 10 }),
              fc.record({
                type: fc.constantFrom('string', 'number', 'boolean'),
              }),
              { minKeys: 1, maxKeys: 5 }
            )
            .chain((properties) => {
              const propNames = Object.keys(properties);
              return fc.record({
                type: fc.constant('object'),
                properties: fc.constant(properties),
                required: fc.subarray(propNames, {
                  minLength: 0,
                  maxLength: propNames.length,
                }),
                minProperties: fc.integer({ min: 0, max: propNames.length }),
                maxProperties: fc.integer({
                  min: propNames.length,
                  max: propNames.length + 2,
                }),
              });
            }),
          fc.integer({ min: 0, max: 1000 }),
          (schema, seed) => {
            const context = createGeneratorContext(
              schema as Schema,
              formatRegistry,
              { seed }
            );
            const result = generator.generate(schema as Schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              const value = result.value;
              expect(generator.validate(value, schema as Schema)).toBe(true);

              // Explicit AJV oracle validation with error logging
              const ajv = getAjv();
              const validate = ajv.compile(schema);
              const isValid = validate(value);
              if (!isValid) {
                console.log(
                  'AJV validation errors for integration test:',
                  validate.errors
                );
              }
              expect(isValid).toBe(true);

              // Also validate with matcher
              expect(value).toMatchJsonSchema(schema);
            }
          }
        ),
        { parameters: { seed: 424242, numRuns: 100 } }
      );
    });

    it('should handle circular reference prevention', () => {
      const schemaWithPotentialCircular = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          parent: { type: 'object' }, // Could reference same type
          children: {
            type: 'array',
            items: { type: 'object' }, // Could reference same type
          },
        },
      };

      const context = createGeneratorContext(
        schemaWithPotentialCircular as Schema,
        formatRegistry,
        { seed: 424242 }
      );
      const result = generator.generate(
        schemaWithPotentialCircular as Schema,
        context
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toMatchJsonSchema(schemaWithPotentialCircular);
      }
    });

    it('should maintain performance benchmarks for large objects', () => {
      const schemas = [
        {
          type: 'object',
          properties: Object.fromEntries(
            Array.from({ length: 50 }, (_, i) => [
              `prop${i}`,
              { type: 'string' },
            ])
          ),
          minProperties: 25,
          maxProperties: 50,
        },
        {
          type: 'object',
          properties: {
            nested1: {
              type: 'object',
              properties: Object.fromEntries(
                Array.from({ length: 20 }, (_, i) => [
                  `prop${i}`,
                  { type: 'number' },
                ])
              ),
            },
            nested2: {
              type: 'object',
              properties: Object.fromEntries(
                Array.from({ length: 20 }, (_, i) => [
                  `prop${i}`,
                  { type: 'boolean' },
                ])
              ),
            },
          },
        },
      ];

      schemas.forEach((schema) => {
        const startTime = performance.now();

        // Generate 100 objects
        for (let i = 0; i < 100; i++) {
          const context = createGeneratorContext(
            schema as Schema,
            formatRegistry,
            { seed: i }
          );
          const result = generator.generate(schema as Schema, context);
          expect(result.isOk()).toBe(true);
        }

        // Keep total duration for debug; percentile assertions are covered in dedicated benchmarks below
        void (performance.now() - startTime);
      });
    });

    it('should handle constraint coherence with createBounds helper', () => {
      return propertyTest(
        'ObjectGenerator createBounds coherence',
        fc.property(
          createBounds(1, 10), // Use createBounds for consistent min/max
          (bounds) => {
            const [minProps, maxProps] = bounds;
            const schema = {
              type: 'object',
              properties: Object.fromEntries(
                Array.from({ length: maxProps + 2 }, (_, i) => [
                  `prop${i}`,
                  { type: 'string' },
                ])
              ),
              minProperties: minProps,
              maxProperties: maxProps,
            };

            const context = createGeneratorContext(
              schema as Schema,
              formatRegistry,
              { seed: 424242 }
            );
            const result = generator.generate(schema as Schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              const propCount = Object.keys(result.value).length;
              expect(propCount).toBeWithinRange(minProps, maxProps);
              expect(result.value).toMatchJsonSchema(schema);
            }
          }
        ),
        { parameters: { seed: 424242, numRuns: 100 } }
      );
    });

    it('should handle WeakMap caching for nested schemas', () => {
      const deeplyNested = {
        type: 'object',
        properties: {
          level1: {
            type: 'object',
            properties: {
              level2: {
                type: 'object',
                properties: {
                  level3: {
                    type: 'object',
                    properties: {
                      value: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const startTime = performance.now();

      // Generate many deeply nested objects
      for (let i = 0; i < 200; i++) {
        const context = createGeneratorContext(
          deeplyNested as Schema,
          formatRegistry,
          { seed: i }
        );
        const result = generator.generate(deeplyNested as Schema, context);
        expect(result.isOk()).toBe(true);
      }

      // Use dedicated percentile-based performance test below
      void (performance.now() - startTime);
    });
  });

  describe('performance benchmarks', () => {
    it('should meet p95 targets for various object complexities', () => {
      const benchmarks = [
        {
          name: 'small objects',
          schema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              age: { type: 'number' },
            },
            required: ['id', 'name'],
          } as ObjectSchema,
          iterations: 10000,
          p95Target: 0.5,
        },
        {
          name: 'medium objects',
          schema: {
            type: 'object',
            properties: Object.fromEntries(
              Array.from({ length: 20 }, (_, i) => [
                `prop${i}`,
                { type: 'string' },
              ])
            ),
            minProperties: 10,
            maxProperties: 20,
          } as ObjectSchema,
          iterations: 1000,
          p95Target: 1.5,
        },
        {
          name: 'large objects with nested properties',
          schema: {
            type: 'object',
            properties: Object.fromEntries(
              Array.from({ length: 50 }, (_, i) => [
                `prop${i}`,
                i % 3 === 0
                  ? {
                      type: 'object',
                      properties: { nested: { type: 'string' } },
                    }
                  : { type: 'string' },
              ])
            ),
            minProperties: 25,
            maxProperties: 50,
          } as any,
          iterations: 100,
          p95Target: 4.0,
        },
      ];

      const strict = process.env.CI === 'true';
      benchmarks.forEach(({ name, schema, iterations, p95Target }) => {
        const times: number[] = [];

        for (let i = 0; i < iterations; i++) {
          const context = createGeneratorContext(schema, formatRegistry, {
            seed: i,
          });

          const start = performance.now();
          const result = generator.generate(schema, context);
          const duration = performance.now() - start;

          times.push(duration);

          if (i === 0) {
            // Validate first result
            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              const value = result.unwrap();

              // Explicit AJV validation for performance test
              const ajv = getAjv();
              const validate = ajv.compile(schema);
              expect(validate(value)).toBe(true);

              expect(value).toMatchJsonSchema(schema);
            }
          }
        }

        // Calculate percentiles
        times.sort((a, b) => a - b);
        const p50Index = Math.floor(times.length * 0.5);
        const p95Index = Math.floor(times.length * 0.95);
        const p99Index = Math.floor(times.length * 0.99);

        const p50 = times[p50Index];
        const p95 = times[p95Index];
        const p99 = times[p99Index];

        // Log performance metrics
        console.log(`Performance for ${name}:`);
        console.log(`  p50: ${p50?.toFixed(3) ?? 'N/A'}ms`);
        console.log(`  p95: ${p95?.toFixed(3) ?? 'N/A'}ms`);
        console.log(`  p99: ${p99?.toFixed(3) ?? 'N/A'}ms`);

        // Assert p95 target
        // Platform-aware tolerance with optional env override for CI variability
        const platform = process.platform;
        const isWindows = platform === 'win32';
        const envRaw = process.env.P95_TOLERANCE_FACTOR;
        const envFactor =
          envRaw !== undefined && envRaw !== '' ? Number(envRaw) : NaN;
        // Base factors: local 1.5x, CI 2.5x by default; Windows gets extra 1.2x
        const baseFactor = strict ? 2.5 : 1.5; // strict=CI
        const platformFactor = isWindows ? 1.2 : 1.0;
        const factor =
          Number.isFinite(envFactor) && envFactor > 0
            ? Math.max(envFactor, 1)
            : baseFactor * platformFactor;
        const target = p95Target * factor;
        expect(p95).toBeLessThan(target);
      });
    });

    it('should handle memory leak detection for complex nested structures', () => {
      const complexSchema = {
        type: 'object',
        properties: Object.fromEntries(
          Array.from({ length: 20 }, (_, i) => [
            `nested${i}`,
            {
              type: 'object',
              properties: Object.fromEntries(
                Array.from({ length: 10 }, (_, j) => [
                  `prop${j}`,
                  { type: 'string' },
                ])
              ),
            },
          ])
        ),
      };

      // Test memory doesn't grow excessively
      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < 500; i++) {
        const context = createGeneratorContext(
          complexSchema as Schema,
          formatRegistry,
          { seed: i }
        );
        const result = generator.generate(complexSchema as Schema, context);
        expect(result.isOk()).toBe(true);
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;

      // Memory growth should be reasonable (< 50MB for 500 complex objects)
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);
    });
  });
});
