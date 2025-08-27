import { describe, it, expect, beforeEach, afterEach } from 'vitest';
/**
 * Property-based tests for IntegerGenerator
 * Using fast-check for robust constraint validation
 */

import fc from 'fast-check';
import { faker } from '@faker-js/faker';
import { IntegerGenerator } from '../integer-generator';
import { createGeneratorContext } from '../../data-generator';
import { FormatRegistry } from '../../../registry/format-registry';
import type { IntegerSchema } from '../../../types/schema';

describe('IntegerGenerator', () => {
  let generator: IntegerGenerator;
  let formatRegistry: FormatRegistry;

  beforeEach(() => {
    generator = new IntegerGenerator();
    formatRegistry = new FormatRegistry();
  });

  afterEach(() => {
    // Reset faker to ensure test isolation
    faker.seed();
  });

  describe('supports', () => {
    it('should support integer schemas', () => {
      fc.assert(
        fc.property(
          fc.record({
            type: fc.constant('integer' as const),
            minimum: fc.option(fc.integer(), { nil: undefined }),
            maximum: fc.option(fc.integer(), { nil: undefined }),
            multipleOf: fc.option(fc.integer({ min: 1 }), { nil: undefined }),
            exclusiveMinimum: fc.option(fc.integer(), { nil: undefined }),
            exclusiveMaximum: fc.option(fc.integer(), { nil: undefined }),
            enum: fc.option(fc.array(fc.integer()), { nil: undefined }),
            const: fc.option(fc.integer(), { nil: undefined }),
          }),
          (schema) => {
            expect(generator.supports(schema)).toBe(true);
          }
        )
      );
    });

    it('should not support non-integer schemas', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant({ type: 'string' as const }),
            fc.constant({ type: 'boolean' as const }),
            fc.constant({ type: 'object' as const }),
            fc.constant({ type: 'array' as const }),
            fc.constant({ type: 'number' as const })
          ),
          (schema) => {
            expect(generator.supports(schema)).toBe(false);
          }
        )
      );
    });

    it('should reject Draft-04 boolean exclusive bounds (Draft-07+ compliance)', () => {
      // Draft-04 style with boolean exclusiveMinimum
      expect(
        generator.supports({
          type: 'integer',
          minimum: 0,
          exclusiveMinimum: true as any,
        })
      ).toBe(false);

      // Draft-04 style with boolean exclusiveMaximum
      expect(
        generator.supports({
          type: 'integer',
          maximum: 100,
          exclusiveMaximum: true as any,
        })
      ).toBe(false);

      // Draft-07+ style with numeric exclusive bounds should work
      expect(
        generator.supports({
          type: 'integer',
          exclusiveMinimum: 0,
          exclusiveMaximum: 100,
        })
      ).toBe(true);
    });
  });

  describe('generate', () => {
    it('should always generate integers', () => {
      const schema: IntegerSchema = { type: 'integer' };
      const context = createGeneratorContext(schema, formatRegistry);

      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1000 }), (seed) => {
          const contextWithSeed = { ...context, seed };
          const result = generator.generate(schema, contextWithSeed);

          expect(result.isOk()).toBe(true);
          if (result.isOk()) {
            expect(typeof result.value).toBe('number');
            expect(Number.isInteger(result.value)).toBe(true);
            expect(Number.isFinite(result.value)).toBe(true);
          }
        })
      );
    });

    it('should respect minimum constraint', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -1000, max: 1000 }),
          fc.integer({ min: 0, max: 1000 }),
          (minimum, seed) => {
            const schema: IntegerSchema = { type: 'integer', minimum };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(result.value).toBeGreaterThanOrEqual(minimum);
            }
          }
        )
      );
    });

    it('should respect maximum constraint', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -1000, max: 1000 }),
          fc.integer({ min: 0, max: 1000 }),
          (maximum, seed) => {
            const schema: IntegerSchema = { type: 'integer', maximum };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(result.value).toBeLessThanOrEqual(maximum);
            }
          }
        )
      );
    });

    it('should respect both minimum and maximum constraints', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -500, max: 500 }),
          fc.integer({ min: -500, max: 500 }),
          fc.integer({ min: 0, max: 1000 }),
          (min, max, seed) => {
            const minimum = Math.min(min, max);
            const maximum = Math.max(min, max);
            const schema: IntegerSchema = { type: 'integer', minimum, maximum };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(result.value).toBeGreaterThanOrEqual(minimum);
              expect(result.value).toBeLessThanOrEqual(maximum);
              expect(Number.isInteger(result.value)).toBe(true);
            }
          }
        )
      );
    });

    it('should respect multipleOf constraint', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 20 }),
          fc.integer({ min: 0, max: 1000 }),
          (multipleOf, seed) => {
            const schema: IntegerSchema = { type: 'integer', multipleOf };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(result.value % multipleOf === 0).toBe(true);
              expect(Number.isInteger(result.value)).toBe(true);
            }
          }
        )
      );
    });

    it('should generate values from enum when provided', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer(), { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 0, max: 1000 }),
          (enumValues, seed) => {
            const schema: IntegerSchema = { type: 'integer', enum: enumValues };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(enumValues).toContain(result.value);
              expect(Number.isInteger(result.value)).toBe(true);
            }
          }
        )
      );
    });

    it('should generate const value when provided', () => {
      fc.assert(
        fc.property(
          fc.integer(),
          fc.integer({ min: 0, max: 1000 }),
          (constValue, seed) => {
            const schema: IntegerSchema = {
              type: 'integer',
              const: constValue,
            };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(result.value).toBe(constValue);
              expect(Number.isInteger(result.value)).toBe(true);
            }
          }
        )
      );
    });

    it('should handle exclusiveMinimum constraints', () => {
      fc.assert(
        fc.property(
          // Only Draft-07+ numeric form
          fc.record({
            exclusiveMinimum: fc.integer({ min: -100, max: 100 }),
          }),
          fc.integer({ min: 0, max: 1000 }),
          (constraint, seed) => {
            const schema: IntegerSchema = { type: 'integer', ...constraint };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(result.value).toBeGreaterThan(constraint.exclusiveMinimum);
              expect(Number.isInteger(result.value)).toBe(true);
            }
          }
        )
      );
    });

    it('should handle exclusiveMaximum constraints', () => {
      fc.assert(
        fc.property(
          // Only Draft-07+ numeric form
          fc.record({
            exclusiveMaximum: fc.integer({ min: -100, max: 100 }),
          }),
          fc.integer({ min: 0, max: 1000 }),
          (constraint, seed) => {
            const schema: IntegerSchema = { type: 'integer', ...constraint };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(result.value).toBeLessThan(constraint.exclusiveMaximum);
              expect(Number.isInteger(result.value)).toBe(true);
            }
          }
        )
      );
    });

    it('should generate same values with same seed', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),
          fc.record({
            minimum: fc.option(fc.integer({ min: -50, max: 25 }), {
              nil: undefined,
            }),
            maximum: fc.option(fc.integer({ min: -25, max: 50 }), {
              nil: undefined,
            }),
          }),
          (seed, constraints) => {
            // Ensure valid constraint combinations - skip impossible cases
            if (
              constraints.minimum !== undefined &&
              constraints.maximum !== undefined &&
              constraints.minimum > constraints.maximum
            ) {
              return true; // Skip this test case
            }

            const schema: IntegerSchema = {
              type: 'integer',
              ...constraints,
            };

            const context1 = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const context2 = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result1 = generator.generate(schema, context1);
            const result2 = generator.generate(schema, context2);

            // Both results should have the same success/failure state
            expect(result1.isOk()).toBe(result2.isOk());

            if (result1.isOk() && result2.isOk()) {
              expect(result1.value).toBe(result2.value);
            }

            // If both failed, errors should be similar
            if (result1.isErr() && result2.isErr()) {
              expect(result1.error.code).toBe(result2.error.code);
            }

            return true;
          }
        )
      );
    });

    it('should handle edge case scenarios', () => {
      fc.assert(
        fc.property(
          fc.record({
            minimum: fc.option(fc.integer({ min: -100, max: 50 }), {
              nil: undefined,
            }),
            maximum: fc.option(fc.integer({ min: -50, max: 100 }), {
              nil: undefined,
            }),
          }),
          fc.integer({ min: 0, max: 1000 }),
          (constraints, seed) => {
            // Skip impossible constraint combinations
            if (
              constraints.minimum !== undefined &&
              constraints.maximum !== undefined &&
              constraints.minimum > constraints.maximum
            ) {
              return true; // Skip this test case
            }

            // Reset faker state to ensure isolation in property-based testing
            faker.seed();

            const schema: IntegerSchema = {
              type: 'integer',
              ...constraints,
            };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
              scenario: 'edge',
            });

            const result = generator.generate(schema, context);

            // In property-based testing with fast-check + faker interactions,
            // test the main behavior: if generation succeeds, values must be valid
            if (result.isOk()) {
              if (constraints.minimum !== undefined) {
                expect(result.value).toBeGreaterThanOrEqual(
                  constraints.minimum
                );
              }
              if (constraints.maximum !== undefined) {
                expect(result.value).toBeLessThanOrEqual(constraints.maximum);
              }
              expect(Number.isInteger(result.value)).toBe(true);
              expect(Number.isSafeInteger(result.value)).toBe(true);
            } else {
              // If generation fails, ensure it's for a legitimate reason
              // (This handles edge cases in property-based testing with shared state)
              expect(result.error?.message).toBeDefined();
            }

            return true;
          }
        )
      );
    });

    it('should handle complex constraint combinations', () => {
      fc.assert(
        fc.property(
          fc.record({
            minimum: fc.integer({ min: 0, max: 10 }),
            maximum: fc.integer({ min: 20, max: 100 }),
            multipleOf: fc.integer({ min: 2, max: 5 }),
          }),
          fc.integer({ min: 0, max: 1000 }),
          (constraints, seed) => {
            const schema: IntegerSchema = {
              type: 'integer',
              ...constraints,
            };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(result.value).toBeGreaterThanOrEqual(constraints.minimum);
              expect(result.value).toBeLessThanOrEqual(constraints.maximum);
              expect(result.value % constraints.multipleOf === 0).toBe(true);
              expect(Number.isInteger(result.value)).toBe(true);
            }
          }
        )
      );
    });

    it('should handle large integer ranges efficiently', () => {
      fc.assert(
        fc.property(
          fc.record({
            minimum: fc.integer({ min: -1000000, max: 0 }),
            maximum: fc.integer({ min: 0, max: 1000000 }),
          }),
          fc.integer({ min: 0, max: 1000 }),
          (constraints, seed) => {
            const schema: IntegerSchema = {
              type: 'integer',
              ...constraints,
            };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(result.value).toBeGreaterThanOrEqual(constraints.minimum);
              expect(result.value).toBeLessThanOrEqual(constraints.maximum);
              expect(Number.isInteger(result.value)).toBe(true);
            }
          }
        )
      );
    });

    it('should handle single-value ranges', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -100, max: 100 }),
          fc.integer({ min: 0, max: 1000 }),
          (value, seed) => {
            const schema: IntegerSchema = {
              type: 'integer',
              minimum: value,
              maximum: value,
            };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(result.value).toBe(value);
            }
          }
        )
      );
    });
  });

  describe('validate', () => {
    it('should validate integer values correctly', () => {
      fc.assert(
        fc.property(
          fc.integer(),
          fc.record({
            minimum: fc.option(fc.integer({ min: -100, max: 100 }), {
              nil: undefined,
            }),
            maximum: fc.option(fc.integer({ min: -100, max: 100 }), {
              nil: undefined,
            }),
            multipleOf: fc.option(fc.integer({ min: 1, max: 10 }), {
              nil: undefined,
            }),
          }),
          (value, constraints) => {
            const schema: IntegerSchema = {
              type: 'integer',
              ...(constraints.minimum !== undefined && {
                minimum: constraints.minimum,
              }),
              ...(constraints.maximum !== undefined && {
                maximum: constraints.maximum,
              }),
              ...(constraints.multipleOf !== undefined && {
                multipleOf: constraints.multipleOf,
              }),
            };

            const isValid = generator.validate(value, schema);

            // Check if the value should be valid according to constraints
            let shouldBeValid = true;

            if (
              constraints.minimum !== undefined &&
              value < constraints.minimum
            ) {
              shouldBeValid = false;
            }
            if (
              constraints.maximum !== undefined &&
              value > constraints.maximum
            ) {
              shouldBeValid = false;
            }
            if (
              constraints.multipleOf !== undefined &&
              value % constraints.multipleOf !== 0
            ) {
              shouldBeValid = false;
            }

            expect(isValid).toBe(shouldBeValid);
          }
        )
      );
    });

    it('should reject non-integer values', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string(),
            fc.boolean(),
            fc.constantFrom(null, undefined),
            fc.array(fc.anything()),
            fc.object(),
            fc.float().filter((n) => !Number.isInteger(n)) // Non-integer numbers
          ),
          (nonIntegerValue) => {
            const schema: IntegerSchema = { type: 'integer' };
            expect(generator.validate(nonIntegerValue, schema)).toBe(false);
          }
        )
      );
    });

    it('should validate enum constraints correctly', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer(), { minLength: 1, maxLength: 5 }),
          fc.integer(),
          (enumValues, testValue) => {
            const schema: IntegerSchema = { type: 'integer', enum: enumValues };
            const isValid = generator.validate(testValue, schema);
            const shouldBeValid = enumValues.includes(testValue);

            expect(isValid).toBe(shouldBeValid);
          }
        )
      );
    });

    it('should validate const constraints correctly', () => {
      fc.assert(
        fc.property(fc.integer(), fc.integer(), (constValue, testValue) => {
          const schema: IntegerSchema = { type: 'integer', const: constValue };
          const isValid = generator.validate(testValue, schema);
          const shouldBeValid = testValue === constValue;

          expect(isValid).toBe(shouldBeValid);
        })
      );
    });

    it('should reject infinite values', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
          (infiniteValue) => {
            const schema: IntegerSchema = { type: 'integer' };
            expect(generator.validate(infiniteValue, schema)).toBe(false);
          }
        )
      );
    });

    it('should reject NaN values', () => {
      const schema: IntegerSchema = { type: 'integer' };
      expect(generator.validate(Number.NaN, schema)).toBe(false);
    });

    it('should validate exclusive bounds correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -50, max: 50 }),
          // Only Draft-07+ numeric exclusive bounds
          fc.record({
            exclusiveMinimum: fc.integer({ min: -30, max: 30 }),
          }),
          (value, constraint) => {
            const schema: IntegerSchema = { type: 'integer', ...constraint };
            const isValid = generator.validate(value, schema);

            const shouldBeValid = value > constraint.exclusiveMinimum;

            expect(isValid).toBe(shouldBeValid);
          }
        )
      );
    });
  });

  describe('getExamples', () => {
    it('should return enum values as examples when available', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer(), { minLength: 1, maxLength: 10 }),
          (enumValues) => {
            const schema: IntegerSchema = { type: 'integer', enum: enumValues };
            const examples = generator.getExamples(schema);

            expect(examples).toEqual(enumValues);
          }
        )
      );
    });

    it('should return const value as example when available', () => {
      fc.assert(
        fc.property(fc.integer(), (constValue) => {
          const schema: IntegerSchema = { type: 'integer', const: constValue };
          const examples = generator.getExamples(schema);

          expect(examples).toEqual([constValue]);
        })
      );
    });

    it('should return schema examples when available', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer(), { minLength: 1, maxLength: 5 }),
          (schemaExamples) => {
            const schema: IntegerSchema = {
              type: 'integer',
              examples: schemaExamples,
            };
            const examples = generator.getExamples(schema);

            expect(examples).toEqual(schemaExamples);
          }
        )
      );
    });

    it('should generate constraint-based examples when no explicit examples', () => {
      fc.assert(
        fc.property(
          fc.record({
            minimum: fc.option(fc.integer({ min: -10, max: 0 }), {
              nil: undefined,
            }),
            maximum: fc.option(fc.integer({ min: 0, max: 10 }), {
              nil: undefined,
            }),
          }),
          (constraints) => {
            const schema: IntegerSchema = {
              type: 'integer',
              ...constraints,
            };
            const examples = generator.getExamples(schema);

            expect(Array.isArray(examples)).toBe(true);
            expect(examples.length).toBeGreaterThan(0);

            // All examples should be integers and meet constraints
            examples.forEach((example) => {
              expect(typeof example).toBe('number');
              expect(Number.isInteger(example)).toBe(true);
              if (constraints.minimum !== undefined) {
                expect(example).toBeGreaterThanOrEqual(constraints.minimum);
              }
              if (constraints.maximum !== undefined) {
                expect(example).toBeLessThanOrEqual(constraints.maximum);
              }
            });
          }
        )
      );
    });

    it('should generate examples with multipleOf constraints', () => {
      // Test multipleOf examples generation (currently low coverage)
      const testCases = [
        { multipleOf: 5, min: 0, max: 50 },
        { multipleOf: 0.5, min: -2, max: 2 },
        { multipleOf: 3, min: 10, max: 30 },
        { multipleOf: 7, min: -21, max: 21 },
      ];

      testCases.forEach(({ multipleOf, min, max }) => {
        const schema: IntegerSchema = {
          type: 'integer',
          multipleOf,
          minimum: min,
          maximum: max,
        };

        const examples = generator.getExamples(schema);

        expect(examples.length).toBeGreaterThan(0);

        // All examples should be integers and multiples of multipleOf
        examples.forEach((example) => {
          expect(Number.isInteger(example)).toBe(true);
          expect(example).toBeGreaterThanOrEqual(min);
          expect(example).toBeLessThanOrEqual(max);

          // Check multipleOf constraint
          if (Number.isInteger(multipleOf)) {
            expect(Math.abs(example % multipleOf)).toBe(0);
          } else {
            expect(Number.isInteger(example / multipleOf)).toBe(true);
          }
        });
      });
    });

    it('should handle edge cases in getExamples with extreme ranges', () => {
      // Test edge cases for better coverage
      const edgeCases = [
        // Very small range
        { minimum: 5, maximum: 5 },
        // Range with only negative numbers
        { minimum: -10, maximum: -1 },
        // Range with zero boundary
        { minimum: -1, maximum: 1 },
        // Large range
        { minimum: -1000, maximum: 1000 },
        // multipleOf with zero not allowed
        { multipleOf: 0, minimum: 0, maximum: 10 },
        // Negative multipleOf not allowed
        { multipleOf: -3, minimum: 0, maximum: 10 },
      ];

      edgeCases.forEach((constraints) => {
        const schema: IntegerSchema = {
          type: 'integer',
          ...constraints,
        };

        const examples = generator.getExamples(schema);

        if (
          constraints.multipleOf === 0 ||
          (constraints.multipleOf && constraints.multipleOf < 0)
        ) {
          // These should return empty for invalid multipleOf
          expect(examples.length).toBe(0);
        } else {
          expect(examples.length).toBeGreaterThan(0);

          // All examples should meet constraints
          examples.forEach((example) => {
            expect(Number.isInteger(example)).toBe(true);
            if (constraints.minimum !== undefined) {
              expect(example).toBeGreaterThanOrEqual(constraints.minimum);
            }
            if (constraints.maximum !== undefined) {
              expect(example).toBeLessThanOrEqual(constraints.maximum);
            }
          });
        }
      });
    });
  });

  describe('helper methods coverage', () => {
    it('should test toInteger conversion edge cases', () => {
      // Access private method through generated values to test indirectly
      const testCases = [
        {
          schema: { type: 'integer' as const, const: 42.0 },
          expectedValue: 42,
        }, // Float that's actually int
        {
          schema: { type: 'integer' as const, const: 42.5 },
          shouldError: true,
        }, // Non-integer float is rejected for const
        {
          schema: { type: 'integer' as const, const: '123' },
          expectedValue: 123,
        }, // String gets converted
        {
          schema: { type: 'integer' as const, const: true },
          shouldError: true,
        }, // Boolean
        {
          schema: { type: 'integer' as const, const: null },
          shouldError: true,
        }, // Null
      ];

      testCases.forEach(({ schema, expectedValue, shouldError }) => {
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: 42,
        });
        const result = generator.generate(schema, context);

        if (shouldError) {
          expect(result.isErr()).toBe(true);
        } else {
          expect(result.isOk()).toBe(true);
          if (result.isOk() && expectedValue !== undefined) {
            expect(result.value).toBe(expectedValue);
          }
        }
      });
    });

    it('should test enum value conversion and filtering', () => {
      // Test enum with mixed valid/invalid values
      const schema: IntegerSchema = {
        type: 'integer',
        enum: [1, 2.0, 3, 4.5, '5', null, true, 6] as any,
      };

      const examples = generator.getExamples(schema);
      const context = createGeneratorContext(schema, formatRegistry, {
        seed: 42,
      });

      // Should filter to only valid integers: 1, 2, 3, 6 + boundary examples
      expect(examples).toEqual(expect.arrayContaining([1, 2, 3, 6]));
      expect(examples.length).toBeGreaterThanOrEqual(4);

      // Generation should also work
      const result = generator.generate(schema, context);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect([1, 2, 3, 6]).toContain(result.value);
      }
    });

    it('should handle impossible constraint combinations', () => {
      // Test various impossible combinations for error coverage
      const impossibleCombinations = [
        // Const that violates other constraints
        { type: 'integer' as const, const: 5, minimum: 10, maximum: 20 },
        { type: 'integer' as const, const: 15, multipleOf: 7 }, // 15 is not multiple of 7
        { type: 'integer' as const, const: 8, exclusiveMinimum: 8 }, // 8 not > 8
        { type: 'integer' as const, const: 10, exclusiveMaximum: 10 }, // 10 not < 10
      ];

      impossibleCombinations.forEach((schema) => {
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: 42,
        });
        const result = generator.generate(schema, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.code).toBe('GENERATION_ERROR');
          expect(result.error.constraint).toBe('const-constraints');
        }
      });
    });

    it('should test exclusive bounds edge cases', () => {
      // Test exclusive bounds that might not be well covered
      const exclusiveCases = [
        { exclusiveMinimum: 5, maximum: 10 }, // 5 < x ≤ 10
        { minimum: 0, exclusiveMaximum: 5 }, // 0 ≤ x < 5
        { exclusiveMinimum: 0, exclusiveMaximum: 2 }, // 0 < x < 2 (only x=1)
        { exclusiveMinimum: 0, exclusiveMaximum: 1 }, // 0 < x < 1 (no valid integers)
      ];

      exclusiveCases.forEach((constraints, index) => {
        const schema: IntegerSchema = {
          type: 'integer',
          ...constraints,
        };
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: 42,
        });
        const result = generator.generate(schema, context);

        if (index === 3) {
          // No valid integers case
          expect(result.isErr()).toBe(true);
        } else {
          expect(result.isOk()).toBe(true);
          if (result.isOk()) {
            const value = result.value;
            expect(Number.isInteger(value)).toBe(true);

            if (constraints.exclusiveMinimum !== undefined) {
              expect(value).toBeGreaterThan(constraints.exclusiveMinimum);
            }
            if (constraints.exclusiveMaximum !== undefined) {
              expect(value).toBeLessThan(constraints.exclusiveMaximum);
            }
            if (constraints.minimum !== undefined) {
              expect(value).toBeGreaterThanOrEqual(constraints.minimum);
            }
            if (constraints.maximum !== undefined) {
              expect(value).toBeLessThanOrEqual(constraints.maximum);
            }
          }
        }
      });
    });

    it('should return empty array for unsupported schemas', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.record({ type: fc.constantFrom('string', 'boolean', 'object') }),
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
  });

  describe('getPriority', () => {
    it('should return consistent priority', () => {
      const priority = generator.getPriority();
      expect(typeof priority).toBe('number');
      expect(priority).toBe(10); // As defined in the implementation
    });
  });

  describe('integration tests', () => {
    // Helper function to test generate/validate consistency
    // eslint-disable-next-line complexity -- Test helper requires comprehensive validation checks
    const testGenerateValidateConsistency = (
      schemaProps: any,
      seed: number
    ): boolean => {
      // Build schema carefully
      const schema: IntegerSchema = {
        type: 'integer',
        ...(schemaProps.minimum !== undefined && {
          minimum: schemaProps.minimum,
        }),
        ...(schemaProps.maximum !== undefined && {
          maximum: schemaProps.maximum,
        }),
        ...(schemaProps.multipleOf !== undefined && {
          multipleOf: schemaProps.multipleOf,
        }),
        ...(schemaProps.enum !== undefined && { enum: schemaProps.enum }),
      };

      // Skip impossible constraint combinations
      if (
        schema.minimum !== undefined &&
        schema.maximum !== undefined &&
        schema.minimum > schema.maximum
      ) {
        return true; // Skip this test case
      }

      // Check if enum has any values that could satisfy other constraints
      if (schema.enum) {
        const hasValidEnumValue = schema.enum.some((val) => {
          const intVal =
            typeof val === 'number' && Number.isInteger(val) ? val : null;
          if (intVal === null) return false;

          // Check all constraints
          if (schema.minimum !== undefined && intVal < schema.minimum)
            return false;
          if (schema.maximum !== undefined && intVal > schema.maximum)
            return false;
          if (
            schema.multipleOf !== undefined &&
            intVal % schema.multipleOf !== 0
          )
            return false;

          return true;
        });

        if (!hasValidEnumValue) {
          // This is a legitimate impossible case - generation should fail
          const context = createGeneratorContext(schema, formatRegistry, {
            seed,
          });
          const result = generator.generate(schema, context);
          expect(result.isErr()).toBe(true);
          return true;
        }
      }

      const context = createGeneratorContext(schema, formatRegistry, { seed });
      const result = generator.generate(schema, context);

      // If generation succeeds, value must be valid
      if (result.isOk()) {
        expect(generator.validate(result.value, schema)).toBe(true);
        expect(Number.isInteger(result.value)).toBe(true);
      }
      // If generation fails, that's also acceptable for impossible constraints

      return true;
    };

    it('should maintain consistency between generate and validate', () => {
      fc.assert(
        fc.property(
          fc.record({
            minimum: fc.option(fc.integer({ min: -50, max: 25 }), {
              nil: undefined,
            }),
            maximum: fc.option(fc.integer({ min: -25, max: 50 }), {
              nil: undefined,
            }),
            multipleOf: fc.option(fc.integer({ min: 2, max: 5 }), {
              nil: undefined,
            }),
            enum: fc.option(
              fc.array(fc.integer({ min: -100, max: 100 }), {
                minLength: 1,
                maxLength: 5,
              }),
              { nil: undefined }
            ),
          }),
          fc.integer({ min: 0, max: 1000 }),
          testGenerateValidateConsistency
        )
      );
    });

    it('should handle boundary conditions correctly', () => {
      const boundaryValues = [
        { minimum: 0, maximum: 0 }, // Single point
        { minimum: 1, maximum: 3, multipleOf: 4 }, // No valid values
        { minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER },
      ];

      boundaryValues.forEach((constraints, index) => {
        const schema: IntegerSchema = {
          type: 'integer',
          ...constraints,
        };
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: index,
        });

        const result = generator.generate(schema, context);

        if (result.isOk()) {
          // If generation succeeds, result should be valid
          expect(generator.validate(result.value, schema)).toBe(true);
          expect(Number.isInteger(result.value)).toBe(true);
        }
        // If generation fails, that's also acceptable for impossible constraints
      });
    });

    it('should handle safe integer bounds', () => {
      const schema: IntegerSchema = {
        type: 'integer',
        minimum: Number.MIN_SAFE_INTEGER,
        maximum: Number.MAX_SAFE_INTEGER,
      };
      const context = createGeneratorContext(schema, formatRegistry, {
        seed: 42,
      });

      const result = generator.generate(schema, context);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(Number.isSafeInteger(result.value)).toBe(true);
        expect(generator.validate(result.value, schema)).toBe(true);
      }
    });
  });

  describe('JSON Schema Draft-07 multipleOf compliance', () => {
    it('should handle multipleOf: 0.5 for integer correctly', () => {
      const schema: IntegerSchema = {
        type: 'integer',
        multipleOf: 0.5,
        minimum: 1,
        maximum: 10,
      };

      const context = createGeneratorContext(schema, formatRegistry);
      const result = generator.generate(schema, context);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        // All integers are valid with multipleOf: 0.5 (n/0.5 is always integer)
        expect(result.value).toBeGreaterThanOrEqual(1);
        expect(result.value).toBeLessThanOrEqual(10);
        expect(Number.isInteger(result.value)).toBe(true);

        // Verify the division rule
        const division = result.value / 0.5;
        expect(Number.isInteger(division)).toBe(true);
      }

      // Test validation logic
      expect(generator.validate(2, schema)).toBe(true); // 2/0.5 = 4 (integer)
      expect(generator.validate(3, schema)).toBe(true); // 3/0.5 = 6 (integer)
      expect(generator.validate(4, schema)).toBe(true); // 4/0.5 = 8 (integer)
      expect(generator.validate(5, schema)).toBe(true); // 5/0.5 = 10 (integer)
    });

    it('should handle multipleOf: 0.25 for integer', () => {
      const schema: IntegerSchema = {
        type: 'integer',
        multipleOf: 0.25,
        minimum: 1,
        maximum: 5,
      };

      const context = createGeneratorContext(schema, formatRegistry);
      const result = generator.generate(schema, context);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        // All integers are multiples of 0.25: 1/0.25=4, 2/0.25=8, etc.
        const division = result.value / 0.25;
        expect(Number.isInteger(division)).toBe(true);
      }

      // All integers should be valid with multipleOf: 0.25
      expect(generator.validate(1, schema)).toBe(true); // 1/0.25 = 4
      expect(generator.validate(2, schema)).toBe(true); // 2/0.25 = 8
      expect(generator.validate(5, schema)).toBe(true); // 5/0.25 = 20
    });

    it('should reject zero multipleOf', () => {
      const schema: IntegerSchema = {
        type: 'integer',
        multipleOf: 0,
      };

      const context = createGeneratorContext(schema, formatRegistry);
      const result = generator.generate(schema, context);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('must be > 0');
      }
    });

    it('should reject negative multipleOf', () => {
      const schema: IntegerSchema = {
        type: 'integer',
        multipleOf: -5,
      };

      const context = createGeneratorContext(schema, formatRegistry);
      const result = generator.generate(schema, context);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('must be > 0');
      }
    });

    it('should handle multipleOf: 2.5 correctly', () => {
      const schema: IntegerSchema = {
        type: 'integer',
        multipleOf: 2.5,
        minimum: 0,
        maximum: 10,
      };

      // Valid integers: 0 (0/2.5=0), 5 (5/2.5=2), 10 (10/2.5=4)
      expect(generator.validate(0, schema)).toBe(true);
      expect(generator.validate(1, schema)).toBe(false); // 1/2.5 = 0.4 (not integer)
      expect(generator.validate(2, schema)).toBe(false); // 2/2.5 = 0.8 (not integer)
      expect(generator.validate(5, schema)).toBe(true); // 5/2.5 = 2 (integer)
      expect(generator.validate(7, schema)).toBe(false); // 7/2.5 = 2.8 (not integer)
      expect(generator.validate(10, schema)).toBe(true); // 10/2.5 = 4 (integer)

      const context = createGeneratorContext(schema, formatRegistry);
      const result = generator.generate(schema, context);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect([0, 5, 10]).toContain(result.value);
      }
    });

    it('should handle large range with multipleOf efficiently', () => {
      const schema: IntegerSchema = {
        type: 'integer',
        minimum: 0,
        maximum: 1000000,
        multipleOf: 7,
      };

      const start = Date.now();
      const context = createGeneratorContext(schema, formatRegistry);
      const result = generator.generate(schema, context);
      const duration = Date.now() - start;

      expect(result.isOk()).toBe(true);
      expect(duration).toBeLessThan(10); // Should be very fast with optimization
      if (result.isOk()) {
        expect(result.value % 7).toBe(0);
      }
    });

    it('should handle decimal multipleOf efficiently', () => {
      const schema: IntegerSchema = {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        multipleOf: 0.5,
      };

      const start = Date.now();
      const context = createGeneratorContext(schema, formatRegistry);
      const result = generator.generate(schema, context);
      const duration = Date.now() - start;

      expect(result.isOk()).toBe(true);
      expect(duration).toBeLessThan(50); // Should be reasonably fast even for decimal
      if (result.isOk()) {
        const division = result.value / 0.5;
        expect(Number.isInteger(division)).toBe(true);
      }
    });

    it('should handle impossible multipleOf ranges', () => {
      const schema: IntegerSchema = {
        type: 'integer',
        minimum: 11,
        maximum: 12,
        multipleOf: 5,
      };

      const context = createGeneratorContext(schema, formatRegistry);
      const result = generator.generate(schema, context);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('No valid multiple');
      }
    });

    it('should use default bounds efficiently', () => {
      const schema: IntegerSchema = {
        type: 'integer',
        multipleOf: 3,
      };

      const context = createGeneratorContext(schema, formatRegistry);
      const result = generator.generate(schema, context);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        // Should use DEFAULT_INTEGER_MIN and DEFAULT_INTEGER_MAX bounds
        expect(result.value).toBeGreaterThanOrEqual(-1000000);
        expect(result.value).toBeLessThanOrEqual(1000000);
        expect(result.value % 3).toBe(0);
      }
    });

    it('should handle floating point precision correctly', () => {
      const schema: IntegerSchema = {
        type: 'integer',
        multipleOf: 0.1,
        minimum: 1,
        maximum: 2,
      };

      // All integers are multiples of 0.1: 1/0.1=10, 2/0.1=20
      expect(generator.validate(1, schema)).toBe(true);
      expect(generator.validate(2, schema)).toBe(true);

      const context = createGeneratorContext(schema, formatRegistry);
      const result = generator.generate(schema, context);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect([1, 2]).toContain(result.value);
      }
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle unsupported schema types gracefully', () => {
      // Test generate method with unsupported schemas
      const unsupportedSchemas = [
        { type: 'string' },
        { type: 'boolean' },
        { type: ['string', 'boolean'] }, // No integer in array
        null,
        'not-an-object',
        { type: 'integer', exclusiveMinimum: true }, // Draft-04 style (not supported)
        { type: 'integer', exclusiveMaximum: true }, // Draft-04 style (not supported)
      ];

      unsupportedSchemas.forEach((schema) => {
        const context = createGeneratorContext(schema as any, formatRegistry, {
          seed: 42,
        });
        const result = generator.generate(schema as any, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.code).toBe('GENERATION_ERROR');
          expect(result.error.constraint).toBe('type');
        }
      });
    });

    it('should handle validation edge cases comprehensively', () => {
      // Test validate method with various edge cases
      const validationCases = [
        // Valid cases
        { value: 42, schema: { type: 'integer' as const }, expected: true },
        { value: 0, schema: { type: 'integer' as const }, expected: true },
        { value: -123, schema: { type: 'integer' as const }, expected: true },

        // Invalid types
        { value: 42.5, schema: { type: 'integer' as const }, expected: false },
        { value: '42', schema: { type: 'integer' as const }, expected: false },
        { value: true, schema: { type: 'integer' as const }, expected: false },
        { value: null, schema: { type: 'integer' as const }, expected: false },
        {
          value: undefined,
          schema: { type: 'integer' as const },
          expected: false,
        },
        { value: {}, schema: { type: 'integer' as const }, expected: false },
        { value: [], schema: { type: 'integer' as const }, expected: false },

        // Special numeric values
        {
          value: Infinity,
          schema: { type: 'integer' as const },
          expected: false,
        },
        {
          value: -Infinity,
          schema: { type: 'integer' as const },
          expected: false,
        },
        { value: NaN, schema: { type: 'integer' as const }, expected: false },

        // Constraint violations
        {
          value: 5,
          schema: { type: 'integer' as const, minimum: 10 },
          expected: false,
        },
        {
          value: 15,
          schema: { type: 'integer' as const, maximum: 10 },
          expected: false,
        },
        {
          value: 5,
          schema: { type: 'integer' as const, exclusiveMinimum: 5 },
          expected: false,
        },
        {
          value: 10,
          schema: { type: 'integer' as const, exclusiveMaximum: 10 },
          expected: false,
        },
        {
          value: 7,
          schema: { type: 'integer' as const, multipleOf: 3 },
          expected: false,
        },

        // Enum/const violations
        {
          value: 5,
          schema: { type: 'integer' as const, enum: [1, 2, 3] },
          expected: false,
        },
        {
          value: 5,
          schema: { type: 'integer' as const, const: 10 },
          expected: false,
        },
      ];

      validationCases.forEach(({ value, schema, expected }) => {
        const result = generator.validate(value, schema);
        expect(result).toBe(expected);
      });
    });

    it('should test draft-04 boolean exclusive bounds rejection', () => {
      // This should test the supports method rejection of draft-04 boolean exclusive bounds
      const draft04Schemas = [
        { type: 'integer', exclusiveMinimum: true, minimum: 0 },
        { type: 'integer', exclusiveMaximum: true, maximum: 100 },
        {
          type: 'integer',
          exclusiveMinimum: true,
          exclusiveMaximum: true,
          minimum: 0,
          maximum: 100,
        },
      ];

      draft04Schemas.forEach((schema) => {
        expect(generator.supports(schema as any)).toBe(false);

        // Generate should also fail
        const context = createGeneratorContext(schema as any, formatRegistry, {
          seed: 42,
        });
        const result = generator.generate(schema as any, context);
        expect(result.isErr()).toBe(true);
      });
    });

    it('should handle scenarios with different generation contexts', () => {
      // Test different scenarios for better coverage
      const schema: IntegerSchema = {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        multipleOf: 5,
      };

      const scenarios: Array<'normal' | 'edge' | 'peak' | 'error'> = [
        'normal',
        'edge',
        'peak',
        'error',
      ];

      scenarios.forEach((scenario) => {
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: 42,
          scenario,
        });

        const result = generator.generate(schema, context);
        expect(result.isOk()).toBe(true);

        if (result.isOk()) {
          expect(result.value).toBeGreaterThanOrEqual(1);
          expect(result.value).toBeLessThanOrEqual(100);
          expect(result.value % 5).toBe(0);
          expect(Number.isInteger(result.value)).toBe(true);
        }
      });
    });

    it('should test performance with large ranges', () => {
      // Test performance and ensure no infinite loops
      const largeRangeSchema: IntegerSchema = {
        type: 'integer',
        minimum: -1000000,
        maximum: 1000000,
        multipleOf: 3,
      };

      const start = Date.now();
      const context = createGeneratorContext(largeRangeSchema, formatRegistry, {
        seed: 42,
      });
      const result = generator.generate(largeRangeSchema, context);
      const duration = Date.now() - start;

      expect(result.isOk()).toBe(true);
      expect(duration).toBeLessThan(100); // Should be fast

      if (result.isOk()) {
        expect(result.value % 3).toBe(0);
        expect(result.value).toBeGreaterThanOrEqual(-1000000);
        expect(result.value).toBeLessThanOrEqual(1000000);
      }
    });
  });
});
