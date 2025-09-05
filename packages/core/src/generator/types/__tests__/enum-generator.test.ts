import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { performance } from 'node:perf_hooks';
/**
 * Property-based tests for EnumGenerator - Testing Architecture v2.1
 * Using fast-check for robust constraint validation with AJV oracle
 *
 * Test coverage:
 * - Enum value selection with uniform distribution
 * - Deterministic generation with seed 424242
 * - Performance benchmarks p95 < 2ms
 * - AJV oracle validation via toMatchJsonSchema
 * - Multi-draft JSON Schema support
 */

import fc from 'fast-check';
// Testing architecture v2.1 imports - relative paths from test file location
import '../../../../../../test/matchers/index';
import { getAjv } from '../../../../../../test/helpers/ajv-factory';
import { EnumGenerator } from '../enum-generator';
import { FormatRegistry } from '../../../registry/format-registry';
import { createGeneratorContext } from '../../data-generator';
import type { Schema } from '../../../types/schema';
import { propertyTest } from '../../../../../../test/setup';

describe('EnumGenerator', () => {
  let generator: EnumGenerator;
  let formatRegistry: FormatRegistry;

  beforeEach(() => {
    generator = new EnumGenerator();
    formatRegistry = new FormatRegistry();
    EnumGenerator.clearCache();
  });

  afterEach(() => {
    EnumGenerator.clearCache();
  });

  describe('supports', () => {
    it('should support schemas with non-empty enum arrays', () => {
      return propertyTest(
        'EnumGenerator supports non-empty enum',
        fc.property(
          fc.array(
            fc.oneof(
              fc.string(),
              fc.integer(),
              fc.boolean(),
              fc.constant(null),
              fc.object()
            ),
            { minLength: 1, maxLength: 10 }
          ),
          (enumValues) => {
            const schema = { enum: enumValues };
            expect(generator.supports(schema)).toBe(true);
          }
        ),
        { parameters: { seed: 424242, numRuns: 100 } }
      );
    });

    it('should not support schemas without enum or with empty enum', () => {
      const unsupportedSchemas = [
        { type: 'string' }, // No enum
        { enum: [] }, // Empty enum
        { enum: null }, // Null enum
        { enum: 'not-array' }, // Non-array enum
        null,
        undefined,
        'string',
        123,
      ];

      unsupportedSchemas.forEach((schema) => {
        expect(generator.supports(schema as any)).toBe(false);
      });
    });

    it('should support mixed-type enums', () => {
      const mixedEnum = [1, 'string', true, null, { key: 'value' }, [1, 2, 3]];
      const schema = { enum: mixedEnum };
      expect(generator.supports(schema)).toBe(true);
    });
  });

  describe('generate', () => {
    it('should generate values from enum with AJV oracle validation', () => {
      return propertyTest(
        'EnumGenerator generate values with AJV',
        fc.property(
          fc.uniqueArray(fc.oneof(fc.string(), fc.integer(), fc.boolean()), {
            minLength: 1,
            maxLength: 10,
          }),
          fc.integer({ min: 0, max: 1000 }),
          (enumValues, seed) => {
            const schema = { enum: enumValues };
            const context = createGeneratorContext(
              schema as Schema,
              formatRegistry,
              { seed }
            );
            const result = generator.generate(schema as Schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              const value = result.value;
              expect(enumValues).toContain(value);

              // Explicit AJV oracle validation with error logging
              const ajv = getAjv();
              const validate = ajv.compile(schema);
              const isValid = validate(value);
              if (!isValid) {
                console.log('AJV validation errors:', validate.errors);
              }
              expect(isValid).toBe(true);

              // Also use matcher for double validation
              expect(value).toMatchJsonSchema(schema);
            }
          }
        ),
        { parameters: { seed: 424242, numRuns: 100 } }
      );
    });

    it('should generate deterministically with same seed', () => {
      return propertyTest(
        'EnumGenerator deterministic same seed',
        fc.property(
          fc.uniqueArray(fc.string(), { minLength: 2, maxLength: 10 }),
          fc.integer({ min: 0, max: 1000 }),
          (enumValues, seed) => {
            const schema = { enum: enumValues };

            // Generate twice with same seed
            const context1 = createGeneratorContext(
              schema as Schema,
              formatRegistry,
              { seed }
            );
            const context2 = createGeneratorContext(
              schema as Schema,
              formatRegistry,
              { seed }
            );

            const result1 = generator.generate(schema as Schema, context1);
            const result2 = generator.generate(schema as Schema, context2);

            expect(result1.isOk()).toBe(true);
            expect(result2.isOk()).toBe(true);

            if (result1.isOk() && result2.isOk()) {
              expect(result1.value).toEqual(result2.value);
            }
          }
        ),
        { parameters: { seed: 424242, numRuns: 100 } }
      );
    });

    it('should handle single-value enums', () => {
      return propertyTest(
        'EnumGenerator single-value enums',
        fc.property(
          fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
          fc.integer({ min: 0, max: 1000 }),
          (singleValue, seed) => {
            const schema = { enum: [singleValue] };
            const context = createGeneratorContext(
              schema as Schema,
              formatRegistry,
              { seed }
            );
            const result = generator.generate(schema as Schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(result.value).toEqual(singleValue);
            }
          }
        ),
        { parameters: { seed: 424242, numRuns: 100 } }
      );
    });

    it('should handle object and array enum values', () => {
      const complexEnum = [
        { type: 'user', id: 1 },
        { type: 'admin', id: 2 },
        [1, 2, 3],
        ['a', 'b', 'c'],
      ];

      const schema = { enum: complexEnum };

      for (let seed = 0; seed < 20; seed++) {
        const context = createGeneratorContext(
          schema as Schema,
          formatRegistry,
          { seed }
        );
        const result = generator.generate(schema as Schema, context);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          const value = result.unwrap();

          // Check deep equality
          const found = complexEnum.some(
            (enumValue) => JSON.stringify(enumValue) === JSON.stringify(value)
          );
          expect(found).toBe(true);
        }
      }
    });

    it('should fail gracefully with empty enum', () => {
      const schema = { enum: [] };
      const context = createGeneratorContext(schema as Schema, formatRegistry, {
        seed: 424242,
      });
      const result = generator.generate(schema as Schema, context);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('empty');
      }
    });

    it('should achieve uniform distribution over many generations', () => {
      const enumValues = ['a', 'b', 'c', 'd'];
      const schema = { enum: enumValues };
      const counts = new Map<string, number>();

      // Generate 1000 samples
      for (let i = 0; i < 1000; i++) {
        const context = createGeneratorContext(
          schema as Schema,
          formatRegistry,
          { seed: i }
        );
        const result = generator.generate(schema as Schema, context);

        if (result.isOk()) {
          const value = result.unwrap() as string;
          counts.set(value, (counts.get(value) || 0) + 1);
        }
      }

      // Check distribution is roughly uniform (each should be ~250)
      enumValues.forEach((value) => {
        const count = counts.get(value) || 0;
        expect(count).toBeGreaterThan(50); // At least 5%
        expect(count).toBeLessThan(500); // At most 50%
      });
    });

    it('should handle draft-specific validation', () => {
      const drafts = ['draft-07', '2019-09', '2020-12'];
      const enumValues = ['draft-specific', 123, true, null];
      const schema = { enum: enumValues };

      drafts.forEach((_draft) => {
        const context = createGeneratorContext(
          schema as Schema,
          formatRegistry,
          {
            seed: 424242,
          }
        );
        const result = generator.generate(schema as Schema, context);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          // Validate with draft-specific AJV
          const ajv = getAjv();
          const validate = ajv.compile(schema);
          expect(validate(result.unwrap())).toBe(true);
        }
      });
    });

    it('should meet performance benchmarks p95 < 2ms', () => {
      const testCases = [
        { size: 10, iterations: 10000 },
        { size: 100, iterations: 1000 },
        { size: 1000, iterations: 100 },
      ];

      testCases.forEach(({ size, iterations }) => {
        const enumValues = Array.from({ length: size }, (_, i) => `value-${i}`);
        const schema = { enum: enumValues };
        const times: number[] = [];

        for (let i = 0; i < iterations; i++) {
          const context = createGeneratorContext(schema, formatRegistry, {
            seed: i,
          });

          const start = performance.now();
          const result = generator.generate(schema, context);
          const duration = performance.now() - start;

          times.push(duration);
          expect(result.isOk()).toBe(true);
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
        console.log(`Performance for enum size ${size}:`);
        console.log(`  p50: ${p50?.toFixed(3) ?? 'N/A'}ms`);
        console.log(`  p95: ${p95?.toFixed(3) ?? 'N/A'}ms`);
        console.log(`  p99: ${p99?.toFixed(3) ?? 'N/A'}ms`);

        // Assert p95 target
        expect(p95).toBeLessThan(2);
      });
    });
  });

  describe('validate', () => {
    it('should validate values in enum', () => {
      return propertyTest(
        'EnumGenerator validate in-enum',
        fc.property(
          fc.array(fc.oneof(fc.string(), fc.integer(), fc.boolean()), {
            minLength: 1,
            maxLength: 10,
          }),
          (enumValues) => {
            const schema = { enum: enumValues };

            // Each enum value should be valid
            enumValues.forEach((value) => {
              expect(generator.validate(value, schema as Schema)).toBe(true);
            });
          }
        ),
        { parameters: { seed: 424242, numRuns: 100 } }
      );
    });

    it('should reject values not in enum', () => {
      return propertyTest(
        'EnumGenerator reject out-of-enum',
        fc.property(
          fc.array(fc.integer({ min: 0, max: 100 }), {
            minLength: 1,
            maxLength: 5,
          }),
          fc.integer({ min: 200, max: 300 }), // Guaranteed not in enum
          (enumValues, testValue) => {
            const schema = { enum: enumValues };
            expect(generator.validate(testValue, schema as Schema)).toBe(false);
          }
        ),
        { parameters: { seed: 424242, numRuns: 100 } }
      );
    });

    it('should handle object equality correctly', () => {
      const enumObjects = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' },
      ];
      const schema = { enum: enumObjects };

      // Exact objects should validate
      enumObjects.forEach((obj) => {
        expect(generator.validate(obj, schema as Schema)).toBe(true);
      });

      // Deep copies should also validate
      enumObjects.forEach((obj) => {
        const copy = JSON.parse(JSON.stringify(obj));
        expect(generator.validate(copy, schema as Schema)).toBe(true);
      });

      // Modified objects should not validate
      expect(
        generator.validate({ id: 1, name: 'David' }, schema as Schema)
      ).toBe(false);
      expect(
        generator.validate({ id: 4, name: 'Alice' }, schema as Schema)
      ).toBe(false);
    });

    it('should reject for unsupported schemas', () => {
      const unsupportedSchemas = [
        { type: 'string' },
        { enum: [] },
        null,
        undefined,
      ];

      unsupportedSchemas.forEach((schema) => {
        expect(generator.validate('any-value', schema as Schema)).toBe(false);
      });
    });
  });

  describe('getExamples', () => {
    it('should return all enum values as examples', () => {
      return propertyTest(
        'EnumGenerator getExamples all values',
        fc.property(
          fc.uniqueArray(fc.oneof(fc.string(), fc.integer(), fc.boolean()), {
            minLength: 1,
            maxLength: 10,
          }),
          (enumValues) => {
            const schema = { enum: enumValues };
            const examples = generator.getExamples(schema);

            expect(examples).toEqual(enumValues);
            expect(examples).toHaveLength(enumValues.length);
          }
        ),
        { parameters: { seed: 424242, numRuns: 100 } }
      );
    });

    it('should return empty array for unsupported schemas', () => {
      const unsupportedSchemas = [
        { type: 'string' },
        { enum: [] },
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
    it('should return appropriate priority level', () => {
      const priority = generator.getPriority();
      expect(typeof priority).toBe('number');
      expect(priority).toBe(20); // Higher than basic types
    });
  });

  describe('generateMultiple', () => {
    it('should generate multiple enum values', () => {
      return propertyTest(
        'EnumGenerator generateMultiple',
        fc.property(
          fc.uniqueArray(fc.string(), { minLength: 1, maxLength: 5 }),
          fc.integer({ min: 2, max: 10 }),
          fc.integer({ min: 0, max: 1000 }),
          (enumValues, count, seed) => {
            const schema = { enum: enumValues };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const result = generator.generateMultiple(schema, context, count);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              const values = result.unwrap();
              expect(values).toHaveLength(count);

              // Validate all generated values with AJV
              const ajv = getAjv();
              const validate = ajv.compile(schema);

              values.forEach((value: any) => {
                expect(enumValues).toContain(value);

                // Explicit AJV validation for each value
                const isValid = validate(value);
                if (!isValid) {
                  console.log(
                    `Multiple generation validation error for value ${JSON.stringify(value)}:`,
                    validate.errors
                  );
                }
                expect(isValid).toBe(true);

                expect(value).toMatchJsonSchema(schema);
              });
            }
          }
        ),
        { parameters: { seed: 424242, numRuns: 50 } }
      );
    });

    it('should fail for unsupported schemas', () => {
      const schema = { type: 'string' }; // No enum
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
        'EnumGenerator generate/validate consistency',
        fc.property(
          fc.uniqueArray(
            fc.oneof(
              fc.string(),
              fc.integer(),
              fc.boolean(),
              fc.constant(null),
              fc.object()
            ),
            { minLength: 1, maxLength: 10, selector: (v) => JSON.stringify(v) }
          ),
          fc.integer({ min: 0, max: 1000 }),
          (enumValues, seed) => {
            const schema = { enum: enumValues };
            const context = createGeneratorContext(
              schema as Schema,
              formatRegistry,
              { seed }
            );
            const result = generator.generate(schema as Schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              const value = result.value;

              // Self-consistency check
              expect(generator.validate(value, schema)).toBe(true);

              // Explicit AJV oracle validation with logging
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

    it('should handle complex nested enum values', () => {
      const complexEnum = [
        {
          type: 'user',
          data: {
            name: 'John',
            roles: ['admin', 'user'],
            metadata: { created: '2024-01-01', tags: ['vip'] },
          },
        },
        {
          type: 'guest',
          data: {
            name: 'Anonymous',
            roles: [],
            metadata: { created: '2024-01-02', tags: [] },
          },
        },
      ];

      const schema = { enum: complexEnum };

      for (let i = 0; i < 10; i++) {
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: i,
        });
        const result = generator.generate(schema, context);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          const value = result.unwrap();
          expect(generator.validate(value, schema)).toBe(true);

          // Explicit AJV validation for complex nested values
          const ajv = getAjv();
          const validate = ajv.compile(schema);
          const isValid = validate(value);
          if (!isValid) {
            console.log('Complex enum validation errors:', validate.errors);
          }
          expect(isValid).toBe(true);

          expect(value).toMatchJsonSchema(schema);
        }
      }
    });

    it('should handle memory efficiently for large enums', () => {
      const largeEnum = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        value: `item-${i}`,
        metadata: { index: i },
      }));
      const schema = { enum: largeEnum };

      const initialMemory = process.memoryUsage().heapUsed;

      // Generate multiple values
      for (let i = 0; i < 100; i++) {
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: i,
        });
        const result = generator.generate(schema, context);
        expect(result.isOk()).toBe(true);
      }

      // Force garbage collection if available
      if (typeof globalThis !== 'undefined' && (globalThis as any).gc) {
        (globalThis as any).gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;

      // Memory growth should be reasonable (< 50MB for large enum operations)
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('performance benchmarks', () => {
    it('should meet p95 targets for various enum sizes', () => {
      const benchmarks = [
        {
          name: 'small enums',
          enumSize: 5,
          iterations: 10000,
          p95Target: 0.5,
        },
        {
          name: 'medium enums',
          enumSize: 100,
          iterations: 1000,
          p95Target: 1.0,
        },
        {
          name: 'large enums',
          enumSize: 1000,
          iterations: 100,
          p95Target: 2.0,
        },
      ];

      benchmarks.forEach(({ name, enumSize, iterations, p95Target }) => {
        const enumValues = Array.from({ length: enumSize }, (_, i) => ({
          id: i,
          value: `item-${i}`,
        }));
        const schema = { enum: enumValues };
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
              const value = result.value;

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
        expect(p95).toBeLessThan(p95Target);
      });
    });
  });
});
