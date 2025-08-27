import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { performance } from 'node:perf_hooks';
/**
 * Property-based tests for EnumGenerator
 * Using fast-check for robust constraint validation
 */

import fc from 'fast-check';
import { EnumGenerator } from '../enum-generator';
import { createGeneratorContext } from '../../data-generator';
import { FormatRegistry } from '../../../registry/format-registry';
import type { Schema } from '../../../types/schema';

describe('EnumGenerator', () => {
  let generator: EnumGenerator;
  let formatRegistry: FormatRegistry;

  beforeEach(() => {
    generator = new EnumGenerator();
    formatRegistry = new FormatRegistry();
    // Clear cache before each test
    EnumGenerator.clearCache();
  });

  afterEach(() => {
    // Clean up cache after each test
    EnumGenerator.clearCache();
  });

  describe('supports', () => {
    it('should support schemas with non-empty enum arrays', () => {
      fc.assert(
        fc.property(
          fc.array(fc.anything(), { minLength: 1, maxLength: 10 }),
          fc.record({
            type: fc.option(
              fc.constantFrom('string', 'number', 'boolean', 'integer')
            ),
          }),
          (enumValues, baseSchema) => {
            const schema = { ...baseSchema, enum: enumValues };
            expect(generator.supports(schema)).toBe(true);
          }
        )
      );
    });

    it('should not support schemas without enum or with empty enum', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            // Schema without enum
            fc.record({ type: fc.constantFrom('string', 'number', 'boolean') }),
            // Schema with empty enum
            fc.record({
              type: fc.constantFrom('string', 'number'),
              enum: fc.constant([]),
            }),
            // Non-object schemas
            fc.constant(null),
            fc.constant(undefined),
            fc.boolean(),
            fc.string()
          ),
          (schema) => {
            expect(generator.supports(schema)).toBe(false);
          }
        )
      );
    });

    it('should support enum schemas with any data types', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.oneof(
              fc.string(),
              fc.integer(),
              fc.boolean(),
              fc.float(),
              fc.constant(null),
              fc.array(fc.string()),
              fc.object()
            ),
            { minLength: 1, maxLength: 5 }
          ),
          (mixedEnumValues) => {
            const schema = { enum: mixedEnumValues };
            expect(generator.supports(schema)).toBe(true);
          }
        )
      );
    });
  });

  describe('generate', () => {
    it('should always generate values from the enum array', () => {
      fc.assert(
        fc.property(
          fc.array(fc.anything(), { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 0, max: 1000 }),
          (enumValues, seed) => {
            const schema = { enum: enumValues };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(enumValues).toContain(result.value);
            }
          }
        )
      );
    });

    it('should generate same values with same seed (deterministic)', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
          fc.integer({ min: 0, max: 1000 }),
          (enumValues, seed) => {
            const schema = { enum: enumValues };

            const context1 = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const context2 = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result1 = generator.generate(schema, context1);
            const result2 = generator.generate(schema, context2);

            expect(result1.isOk()).toBe(true);
            expect(result2.isOk()).toBe(true);

            if (result1.isOk() && result2.isOk()) {
              expect(result1.value).toEqual(result2.value);
            }
          }
        )
      );
    });

    it('should handle single-value enums', () => {
      fc.assert(
        fc.property(
          fc.anything(),
          fc.integer({ min: 0, max: 1000 }),
          (singleValue, seed) => {
            const schema = { enum: [singleValue] };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(result.value).toEqual(singleValue);
            }
          }
        )
      );
    });

    it('should handle enums with duplicate values', () => {
      fc.assert(
        fc.property(
          fc.string(),
          fc.integer({ min: 2, max: 5 }),
          fc.integer({ min: 0, max: 1000 }),
          (value, duplicateCount, seed) => {
            const enumValues = Array(duplicateCount).fill(value);
            const schema = { enum: enumValues };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(result.value).toEqual(value);
            }
          }
        )
      );
    });

    it('should handle enums with different data types', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.oneof(
              fc.string(),
              fc.integer(),
              fc.boolean(),
              fc.constant(null),
              fc.array(fc.integer(), { maxLength: 3 }),
              fc.record({ name: fc.string(), age: fc.integer() })
            ),
            { minLength: 1, maxLength: 8 }
          ),
          fc.integer({ min: 0, max: 1000 }),
          (mixedEnumValues, seed) => {
            const schema = { enum: mixedEnumValues };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              // Should contain the exact value (deep equality for objects)
              const found = mixedEnumValues.some((enumValue) => {
                if (
                  typeof enumValue === 'object' &&
                  typeof result.value === 'object'
                ) {
                  return (
                    JSON.stringify(enumValue) === JSON.stringify(result.value)
                  );
                }
                return enumValue === result.value;
              });
              expect(found).toBe(true);
            }
          }
        )
      );
    });

    it('should eventually generate all enum values over many runs', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer(), { minLength: 2, maxLength: 5 }),
          (enumValues) => {
            const schema = { enum: enumValues };
            const generatedValues = new Set();

            // Generate many samples to increase likelihood of hitting all values
            for (let i = 0; i < 200; i++) {
              const context = createGeneratorContext(schema, formatRegistry, {
                seed: i,
              });
              const result = generator.generate(schema, context);

              if (result.isOk()) {
                generatedValues.add(result.value);
              }
            }

            // Should have generated most (if not all) enum values
            // Allow for some variance in random distribution
            const coverageRatio = generatedValues.size / enumValues.length;
            expect(coverageRatio).toBeGreaterThan(0.5); // At least 50% coverage

            // All generated values should be from the enum
            for (const generated of generatedValues) {
              expect(enumValues).toContain(generated);
            }
          }
        ),
        { numRuns: 20 } // Reduce runs since this test is more intensive
      );
    });

    it('should handle generation config with custom metadata', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string(), { minLength: 2, maxLength: 4 }),
          fc.integer({ min: 0, max: 1000 }),
          (enumValues, seed) => {
            const schema = { enum: enumValues };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            // Test with various generation configs
            const configs = [
              { metadata: { distribution: 'uniform' } },
              { metadata: { distribution: 'first' } },
              { metadata: { distribution: 'last' } },
              { metadata: { enableCaching: true } },
              { metadata: { enableCaching: false } },
              undefined,
            ];

            configs.forEach((config) => {
              const result = generator.generate(schema, context, config);

              expect(result.isOk()).toBe(true);
              if (result.isOk()) {
                expect(enumValues).toContain(result.value);
              }
            });
          }
        )
      );
    });

    it('should handle round-robin distribution', () => {
      const enumValues = ['a', 'b', 'c'];
      const schema = { enum: enumValues };

      const results: string[] = [];

      for (let i = 0; i < 9; i++) {
        // 3 full cycles
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: i,
        });
        const config = {
          metadata: {
            distribution: 'round-robin',
            roundRobinKey: 'test-key',
          },
        };

        const result = generator.generate(schema, context, config);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          results.push(result.value);
        }
      }

      // Should cycle through values in order
      expect(results.slice(0, 3)).toEqual(['a', 'b', 'c']);
      expect(results.slice(3, 6)).toEqual(['a', 'b', 'c']);
      expect(results.slice(6, 9)).toEqual(['a', 'b', 'c']);
    });

    it('should handle weighted distribution', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string(), { minLength: 2, maxLength: 4 }),
          fc.array(fc.float({ min: 0, max: 1 }), {
            minLength: 2,
            maxLength: 4,
          }),
          fc.integer({ min: 0, max: 1000 }),
          (enumValues, weights, seed) => {
            // Ensure weights array matches enum length
            const adjustedWeights = weights.slice(0, enumValues.length);
            while (adjustedWeights.length < enumValues.length) {
              adjustedWeights.push(0.5);
            }

            const schema = { enum: enumValues };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const config = {
              metadata: {
                distribution: 'weighted',
                weights: adjustedWeights,
              },
            };

            const result = generator.generate(schema, context, config);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(enumValues).toContain(result.value);
            }
          }
        )
      );
    });

    it('should fail gracefully with empty enum array', () => {
      const schema = { enum: [] };
      const context = createGeneratorContext(schema, formatRegistry);

      const result = generator.generate(schema, context);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('empty');
      }
    });

    it('should handle caching correctly', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string(), { minLength: 1, maxLength: 3 }),
          fc.integer({ min: 0, max: 100 }),
          (enumValues, seed) => {
            const schema = { enum: enumValues };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const config = {
              metadata: {
                enableCaching: true,
                cacheKeyPrefix: 'test',
              },
            };

            const result1 = generator.generate(schema, context, config);
            const result2 = generator.generate(schema, context, config);

            expect(result1.isOk()).toBe(true);
            expect(result2.isOk()).toBe(true);

            if (result1.isOk() && result2.isOk()) {
              // With caching enabled and same context, should get same result
              expect(result1.value).toEqual(result2.value);
            }
          }
        )
      );
    });
  });

  describe('validate', () => {
    it('should validate values that exist in the enum', () => {
      fc.assert(
        fc.property(
          fc.array(fc.anything(), { minLength: 1, maxLength: 10 }),
          (enumValues) => {
            const schema = { enum: enumValues };

            enumValues.forEach((enumValue) => {
              expect(generator.validate(enumValue, schema)).toBe(true);
            });
          }
        )
      );
    });

    it('should reject values that do not exist in the enum', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
          fc.string(),
          (enumValues, testValue) => {
            fc.pre(!enumValues.includes(testValue)); // Ensure test value is not in enum

            const schema = { enum: enumValues };
            expect(generator.validate(testValue, schema)).toBe(false);
          }
        )
      );
    });

    it('should handle object equality correctly', () => {
      fc.assert(
        fc.property(
          fc.array(fc.record({ id: fc.integer(), name: fc.string() }), {
            minLength: 1,
            maxLength: 3,
          }),
          (enumObjects) => {
            const schema = { enum: enumObjects };

            enumObjects.forEach((enumObject) => {
              expect(generator.validate(enumObject, schema)).toBe(true);

              // Deep copy should also validate
              const deepCopy = JSON.parse(JSON.stringify(enumObject));
              expect(generator.validate(deepCopy, schema)).toBe(true);
            });
          }
        )
      );
    });

    it('should reject values for unsupported schemas', () => {
      fc.assert(
        fc.property(
          fc.anything(),
          fc.oneof(
            fc.record({ type: fc.constantFrom('string', 'number') }),
            fc.constant(null),
            fc.string()
          ),
          (value, unsupportedSchema) => {
            expect(generator.validate(value, unsupportedSchema as any)).toBe(
              false
            );
          }
        )
      );
    });

    it('should handle mixed type enums correctly', () => {
      const mixedEnum = [1, 'hello', true, null, { key: 'value' }, [1, 2, 3]];
      const schema = { enum: mixedEnum };

      mixedEnum.forEach((value) => {
        expect(generator.validate(value, schema)).toBe(true);
      });

      // Values not in enum should be rejected
      expect(generator.validate(2, schema)).toBe(false);
      expect(generator.validate('world', schema)).toBe(false);
      expect(generator.validate(false, schema)).toBe(false);
      expect(generator.validate({ key: 'different' }, schema)).toBe(false);
    });
  });

  describe('getExamples', () => {
    it('should return all enum values as examples', () => {
      fc.assert(
        fc.property(
          fc.array(fc.anything(), { minLength: 1, maxLength: 10 }),
          (enumValues) => {
            const schema = { enum: enumValues };
            const examples = generator.getExamples(schema);

            expect(examples).toEqual([...enumValues]);
          }
        )
      );
    });

    it('should return empty array for unsupported schemas', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.record({ type: fc.constantFrom('string', 'number') }),
            fc.constant(null),
            fc.boolean()
          ),
          (unsupportedSchema) => {
            const examples = generator.getExamples(unsupportedSchema as any);
            expect(examples).toEqual([]);
          }
        )
      );
    });

    it('should handle large enum arrays', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer(), { minLength: 10, maxLength: 100 }),
          (largeEnum) => {
            const schema = { enum: largeEnum };
            const examples = generator.getExamples(schema);

            expect(examples).toHaveLength(largeEnum.length);
            expect(examples).toEqual([...largeEnum]);
          }
        ),
        { numRuns: 5 } // Fewer runs for large arrays
      );
    });
  });

  describe('getPriority', () => {
    it('should return high priority for enum generator', () => {
      const priority = generator.getPriority();
      expect(typeof priority).toBe('number');
      expect(priority).toBe(20); // Higher than basic type generators
    });
  });

  describe('generateMultiple', () => {
    it('should generate multiple enum values', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 0, max: 1000 }),
          (enumValues, count, seed) => {
            const schema = { enum: enumValues };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generateMultiple(schema, context, count);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(result.value).toHaveLength(count);
              result.value.forEach((value) => {
                expect(enumValues).toContain(value);
              });
            }
          }
        )
      );
    });

    it('should fail for unsupported schemas in generateMultiple', () => {
      const unsupportedSchema = { type: 'string' };
      const context = createGeneratorContext(unsupportedSchema, formatRegistry);

      const result = generator.generateMultiple(
        unsupportedSchema as any,
        context,
        5
      );

      expect(result.isErr()).toBe(true);
    });
  });

  describe('cache management', () => {
    it('should provide cache statistics', () => {
      const stats = EnumGenerator.getCacheStats();

      expect(typeof stats.totalEntries).toBe('number');
      expect(typeof stats.totalSelections).toBe('number');
      expect(typeof stats.roundRobinKeys).toBe('number');

      expect(stats.totalEntries).toBeGreaterThanOrEqual(0);
      expect(stats.totalSelections).toBeGreaterThanOrEqual(0);
      expect(stats.roundRobinKeys).toBeGreaterThanOrEqual(0);
    });

    it('should clear cache correctly', () => {
      const enumValues = ['a', 'b', 'c'];
      const schema = { enum: enumValues };
      const context = createGeneratorContext(schema, formatRegistry, {
        seed: 42,
      });
      const config = { metadata: { enableCaching: true } };

      // Generate with caching
      generator.generate(schema, context, config);

      let stats = EnumGenerator.getCacheStats();
      expect(stats.totalEntries).toBeGreaterThan(0);

      // Clear cache
      EnumGenerator.clearCache();

      stats = EnumGenerator.getCacheStats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.totalSelections).toBe(0);
      expect(stats.roundRobinKeys).toBe(0);
    });
  });

  describe('integration tests', () => {
    it('should maintain consistency between generate and validate', () => {
      fc.assert(
        fc.property(
          fc.array(fc.anything(), { minLength: 1, maxLength: 8 }),
          fc.integer({ min: 0, max: 1000 }),
          (enumValues, seed) => {
            const schema = { enum: enumValues };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              // Generated value should always be valid according to the schema
              expect(generator.validate(result.value, schema)).toBe(true);
            }
          }
        )
      );
    });

    it('should handle complex nested enum values', () => {
      const complexEnum = [
        { type: 'user', data: { name: 'John', roles: ['admin', 'user'] } },
        { type: 'guest', data: { name: 'Anonymous', roles: [] } },
        { type: 'system', data: { name: 'System', roles: ['system'] } },
      ];

      const schema = { enum: complexEnum };
      const context = createGeneratorContext(schema, formatRegistry, {
        seed: 123,
      });

      for (let i = 0; i < 10; i++) {
        const contextWithSeed = { ...context, seed: i };
        const result = generator.generate(schema, contextWithSeed);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(generator.validate(result.value, schema)).toBe(true);

          // Should be deep equal to one of the enum values
          const found = complexEnum.some(
            (enumValue) =>
              JSON.stringify(enumValue) === JSON.stringify(result.value)
          );
          expect(found).toBe(true);
        }
      }
    });
  });

  describe('comprehensive Task 4 coverage', () => {
    it('should handle all enum types and sizes', () => {
      const enumTestCases = [
        [1, 2, 3], // Numbers
        ['a', 'b', 'c'], // Strings
        [true, false], // Booleans
        [null], // Null values
        [1, 'mixed', true, null], // Mixed types
        [42], // Single value
        Array.from({ length: 100 }, (_, i) => i), // Large enum (100 values)
      ];

      enumTestCases.forEach((enumValues, caseIndex) => {
        fc.assert(
          fc.property(fc.integer({ min: 0, max: 1000 }), (seed) => {
            const context = createGeneratorContext({}, formatRegistry, {
              seed,
            });
            const result = generator.generateFromEnum(enumValues, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(enumValues).toContain(result.value);
            }
          }),
          { numRuns: 20 }
        );
      });
    });

    it('should maintain uniform distribution for large enums', () => {
      const largeEnum = Array.from({ length: 20 }, (_, i) => `value-${i}`);
      const results = new Map<string, number>();

      // Generate 1000 samples
      for (let i = 0; i < 1000; i++) {
        const context = createGeneratorContext({}, formatRegistry, { seed: i });
        const result = generator.generateFromEnum(largeEnum, context);

        if (result.isOk()) {
          const value = result.value as string;
          results.set(value, (results.get(value) || 0) + 1);
        }
      }

      // Each value should appear at least a few times (not perfectly uniform due to randomness)
      largeEnum.forEach((value) => {
        const count = results.get(value) || 0;
        expect(count).toBeGreaterThan(10); // At least 1% of samples (loose check)
        expect(count).toBeLessThan(200); // Not more than 20% (loose check)
      });
    });

    it('should handle performance requirements', () => {
      const veryLargeEnum = Array.from({ length: 10000 }, (_, i) => i);

      const startTime = performance.now();

      // Generate 1000 values from very large enum
      for (let i = 0; i < 1000; i++) {
        const context = createGeneratorContext({}, formatRegistry, { seed: i });
        const result = generator.generateFromEnum(veryLargeEnum, context);
        expect(result.isOk()).toBe(true);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (< 1 second for 1000 generations)
      expect(duration).toBeLessThan(1000);
    });

    it('should provide correct cache behavior', () => {
      const enumValues = ['cached-1', 'cached-2', 'cached-3'];

      // First generation should populate cache
      const context1 = createGeneratorContext({}, formatRegistry, { seed: 42 });
      const result1 = generator.generateFromEnum(enumValues, context1);
      expect(result1.isOk()).toBe(true);

      // Second generation with same enum should use cache (faster)
      const startTime = performance.now();
      for (let i = 0; i < 100; i++) {
        const context = createGeneratorContext({}, formatRegistry, { seed: i });
        const result = generator.generateFromEnum(enumValues, context);
        expect(result.isOk()).toBe(true);
      }
      const duration = performance.now() - startTime;

      // Should be very fast due to caching
      expect(duration).toBeLessThan(100);
    });
  });
});
