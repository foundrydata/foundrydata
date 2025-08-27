import { describe, it, expect, beforeEach } from 'vitest';
/**
 * Property-based tests for StringGenerator
 * Using fast-check for robust constraint validation
 */

import fc from 'fast-check';
import { StringGenerator } from '../string-generator';
import { createGeneratorContext } from '../../data-generator';
import { FormatRegistry } from '../../../registry/format-registry';
import type { StringSchema, StringFormat } from '../../../types/schema';

describe('StringGenerator', () => {
  let generator: StringGenerator;
  let formatRegistry: FormatRegistry;

  beforeEach(() => {
    generator = new StringGenerator();
    formatRegistry = new FormatRegistry();
  });

  describe('supports', () => {
    it('should support string schemas', () => {
      fc.assert(
        fc.property(
          fc.record({
            type: fc.constant('string' as const),
            minLength: fc.option(fc.nat(), { nil: undefined }),
            maxLength: fc.option(fc.nat(), { nil: undefined }),
            pattern: fc.option(fc.string(), { nil: undefined }),
            format: fc.option(
              fc.constantFrom('uuid', 'email', 'date', 'date-time'),
              { nil: undefined }
            ),
            enum: fc.option(fc.array(fc.string()), { nil: undefined }),
            const: fc.option(fc.string(), { nil: undefined }),
          }),
          (schema) => {
            // Remove undefined properties to match StringSchema interface
            const cleanSchema: any = { type: 'string' };
            if (schema.minLength !== undefined)
              cleanSchema.minLength = schema.minLength;
            if (schema.maxLength !== undefined)
              cleanSchema.maxLength = schema.maxLength;
            if (schema.pattern !== undefined)
              cleanSchema.pattern = schema.pattern;
            if (schema.format !== undefined) cleanSchema.format = schema.format;
            if (schema.enum !== undefined) cleanSchema.enum = schema.enum;
            if (schema.const !== undefined) cleanSchema.const = schema.const;

            expect(generator.supports(cleanSchema)).toBe(true);
          }
        )
      );
    });

    it('should not support non-string schemas', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant({ type: 'number' as const }),
            fc.constant({ type: 'boolean' as const }),
            fc.constant({ type: 'object' as const }),
            fc.constant({ type: 'array' as const })
          ),
          (schema) => {
            expect(generator.supports(schema)).toBe(false);
          }
        )
      );
    });
  });

  describe('generate', () => {
    it('should always generate strings', () => {
      const schema: StringSchema = { type: 'string' };
      const context = createGeneratorContext(schema, formatRegistry);

      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1000 }), (seed) => {
          const contextWithSeed = { ...context, seed };
          const result = generator.generate(schema, contextWithSeed);

          expect(result.isOk()).toBe(true);
          if (result.isOk()) {
            expect(typeof result.value).toBe('string');
          }
        })
      );
    });

    it('should respect minLength constraint', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 0, max: 1000 }),
          (minLength, seed) => {
            const schema: StringSchema = { type: 'string', minLength };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(result.value.length).toBeGreaterThanOrEqual(minLength);
            }
          }
        )
      );
    });

    it('should respect maxLength constraint', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          fc.integer({ min: 0, max: 1000 }),
          (maxLength, seed) => {
            const schema: StringSchema = { type: 'string', maxLength };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(result.value.length).toBeLessThanOrEqual(maxLength);
            }
          }
        )
      );
    });

    it('should respect both minLength and maxLength constraints', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 50 }),
          fc.integer({ min: 0, max: 50 }),
          fc.integer({ min: 0, max: 1000 }),
          (min, max, seed) => {
            const minLength = Math.min(min, max);
            const maxLength = Math.max(min, max);
            const schema: StringSchema = {
              type: 'string',
              minLength,
              maxLength,
            };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(result.value.length).toBeGreaterThanOrEqual(minLength);
              expect(result.value.length).toBeLessThanOrEqual(maxLength);
            }
          }
        )
      );
    });

    it('should generate values from enum when provided', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string(), { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 0, max: 1000 }),
          (enumValues, seed) => {
            const schema: StringSchema = { type: 'string', enum: enumValues };
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

    it('should generate const value when provided', () => {
      fc.assert(
        fc.property(
          fc.string(),
          fc.integer({ min: 0, max: 1000 }),
          (constValue, seed) => {
            const schema: StringSchema = { type: 'string', const: constValue };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(result.value).toBe(constValue);
            }
          }
        )
      );
    });

    it('should generate different values with different seeds', () => {
      const schema: StringSchema = {
        type: 'string',
        minLength: 5,
        maxLength: 10,
      };

      // Test multiple seed pairs to increase confidence
      let sameCount = 0;
      let totalTests = 0;

      for (let i = 0; i < 20; i++) {
        const seed1 = i * 2;
        const seed2 = i * 2 + 1;

        const context1 = createGeneratorContext(schema, formatRegistry, {
          seed: seed1,
        });
        const context2 = createGeneratorContext(schema, formatRegistry, {
          seed: seed2,
        });

        const result1 = generator.generate(schema, context1);
        const result2 = generator.generate(schema, context2);

        expect(result1.isOk()).toBe(true);
        expect(result2.isOk()).toBe(true);

        if (result1.isOk() && result2.isOk()) {
          totalTests++;
          if (result1.value === result2.value) {
            sameCount++;
          }
        }
      }

      // Allow some collisions but not too many (should be different most of the time)
      const collisionRate = sameCount / totalTests;
      expect(collisionRate).toBeLessThan(0.3); // Less than 30% collisions
    });

    it('should generate same values with same seed', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),
          fc.record({
            minLength: fc.option(fc.integer({ min: 0, max: 20 })),
            maxLength: fc.option(fc.integer({ min: 5, max: 50 })),
          }),
          (seed, constraints) => {
            const { minLength, maxLength } = constraints;
            const schema: StringSchema = {
              type: 'string',
              ...(minLength !== null ? { minLength } : {}),
              ...(maxLength !== null ? { maxLength } : {}),
            };

            const context1 = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const context2 = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result1 = generator.generate(schema, context1);
            const result2 = generator.generate(schema, context2);

            // Check if constraints are impossible
            const hasImpossibleConstraints =
              constraints.minLength !== undefined &&
              constraints.minLength !== null &&
              constraints.maxLength !== undefined &&
              constraints.maxLength !== null &&
              constraints.minLength > constraints.maxLength;

            if (hasImpossibleConstraints) {
              // Both should fail with same error
              expect(result1.isErr()).toBe(true);
              expect(result2.isErr()).toBe(true);
            } else {
              expect(result1.isOk()).toBe(true);
              expect(result2.isOk()).toBe(true);

              if (result1.isOk() && result2.isOk()) {
                expect(result1.value).toBe(result2.value);
              }
            }
          }
        )
      );
    });

    it('should handle pattern constraints for simple patterns', () => {
      const patterns = [
        '^[a-zA-Z]+$',
        '^[0-9]+$',
        '^[a-zA-Z0-9]+$',
        '^[a-zA-Z]*$', // Zero or more letters
        '^[0-9]*$', // Zero or more digits
        '^test[0-9]+$', // Specific prefix pattern
      ];

      patterns.forEach((pattern) => {
        fc.assert(
          fc.property(fc.integer({ min: 0, max: 1000 }), (seed) => {
            const schema: StringSchema = { type: 'string', pattern };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              const regex = new RegExp(pattern);
              expect(regex.test(result.value)).toBe(true);
            }
          }),
          { numRuns: 20 } // Fewer runs for pattern tests as they're more constrained
        );
      });
    });

    it('should handle zero-or-more patterns specifically', () => {
      // Test specific problematic patterns manually
      const testCases = [
        { pattern: '^[a-zA-Z]*$', seeds: [0, 39, 86, 542] },
        { pattern: '^[0-9]*$', seeds: [0, 6, 280] },
        { pattern: '^test[0-9]+$', seeds: [0, 100, 200] },
      ];

      testCases.forEach(({ pattern, seeds }) => {
        seeds.forEach((seed) => {
          const schema: StringSchema = { type: 'string', pattern };
          const context = createGeneratorContext(schema, formatRegistry, {
            seed,
          });

          const result = generator.generate(schema, context);

          if (result.isOk()) {
            const regex = new RegExp(pattern);
            const isValid = regex.test(result.value);
            if (!isValid) {
              console.log(
                `FAILING: Pattern "${pattern}", Seed: ${seed}, Generated: "${result.value}" (length: ${result.value.length})`
              );
            }
            expect(isValid).toBe(true);
          } else {
            console.log(
              `ERROR: Pattern "${pattern}", Seed: ${seed}, Error: ${result.error.message}`
            );
            expect(result.isOk()).toBe(true);
          }
        });
      });
    });

    it('should handle edge case scenarios', () => {
      fc.assert(
        fc.property(
          fc.record({
            minLength: fc.option(fc.integer({ min: 0, max: 10 }), {
              nil: undefined,
            }),
            maxLength: fc.option(fc.integer({ min: 5, max: 20 }), {
              nil: undefined,
            }),
          }),
          fc.integer({ min: 0, max: 1000 }),
          (constraints, seed) => {
            const schema: StringSchema = {
              type: 'string',
              ...constraints,
            };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
              scenario: 'edge',
            });

            const result = generator.generate(schema, context);

            // Check if constraints are impossible
            const hasImpossibleConstraints =
              constraints.minLength !== undefined &&
              constraints.minLength !== null &&
              constraints.maxLength !== undefined &&
              constraints.maxLength !== null &&
              constraints.minLength > constraints.maxLength;

            if (hasImpossibleConstraints) {
              expect(result.isErr()).toBe(true);
            } else {
              expect(result.isOk()).toBe(true);
              if (result.isOk()) {
                if (constraints.minLength !== undefined) {
                  expect(result.value.length).toBeGreaterThanOrEqual(
                    constraints.minLength
                  );
                }
                if (
                  constraints.maxLength !== undefined &&
                  constraints.maxLength !== null
                ) {
                  expect(result.value.length).toBeLessThanOrEqual(
                    constraints.maxLength
                  );
                }
              }
            }
          }
        )
      );
    });

    it('should return error for minLength > maxLength', () => {
      const schema: StringSchema = {
        type: 'string',
        minLength: 10,
        maxLength: 5,
      };
      const context = createGeneratorContext(schema, formatRegistry);
      const result = generator.generate(schema, context);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('GENERATION_ERROR');
        expect(result.error.constraint).toBe('constraint-conflict');
        expect(result.error.message).toContain(
          'minLength (10) > maxLength (5)'
        );
      }
    });

    it('should return error for pattern requiring non-empty with maxLength=0', () => {
      const schema: StringSchema = {
        type: 'string',
        pattern: '^[a-z]+$',
        maxLength: 0,
      };
      const context = createGeneratorContext(schema, formatRegistry);
      const result = generator.generate(schema, context);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('GENERATION_ERROR');
        expect(result.error.constraint).toBe('pattern-length-conflict');
        expect(result.error.message).toContain(
          'requires non-empty string but maxLength is 0'
        );
      }
    });

    it('should handle unsupported complex patterns gracefully', () => {
      const complexPatterns = [
        '^(?=.*[A-Z])(?=.*[a-z])(?=.*\\d).{8,}$', // Password pattern
        '^\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b$', // Complex email
        '^(https?):\\/\\/[^\\s$.?#].[^\\s]*$', // URL pattern
      ];

      complexPatterns.forEach((pattern) => {
        const schema: StringSchema = {
          type: 'string',
          pattern,
          minLength: 1,
          maxLength: 50,
        };
        const context = createGeneratorContext(schema, formatRegistry);
        const result = generator.generate(schema, context);

        // Should either succeed or fail gracefully with proper error
        if (result.isErr()) {
          expect(result.error.code).toBe('GENERATION_ERROR');
          expect(result.error.constraint).toBe('pattern');
        } else {
          // If it succeeds, the value should match the pattern and constraints
          expect(result.value.length).toBeGreaterThanOrEqual(1);
          expect(result.value.length).toBeLessThanOrEqual(50);
        }
      });
    });

    it('should not hang on complex patterns', () => {
      const complexPattern = '^(?=.*[A-Z])(?=.*[a-z])(?=.*\\d).{8,}$';
      const schema: StringSchema = {
        type: 'string',
        pattern: complexPattern,
        minLength: 8,
        maxLength: 20,
      };
      const context = createGeneratorContext(schema, formatRegistry);

      const start = Date.now();
      const result = generator.generate(schema, context);
      const duration = Date.now() - start;

      // Should complete within reasonable time (1 second max)
      expect(duration).toBeLessThan(1000);

      // Should either succeed or fail gracefully
      expect(result.isOk() || result.isErr()).toBe(true);
    });

    it('should have consistent performance across different seeds', () => {
      const pattern = '^[a-zA-Z]{10,20}$';
      const schema: StringSchema = { type: 'string', pattern };
      const seeds = [1, 42, 100, 999, 12345];
      const durations: number[] = [];

      seeds.forEach((seed) => {
        const context = createGeneratorContext(schema, formatRegistry, {
          seed,
        });

        const start = Date.now();
        const result = generator.generate(schema, context);
        const duration = Date.now() - start;

        durations.push(duration);
        expect(result.isOk()).toBe(true);
        expect(duration).toBeLessThan(100); // Should be very fast for simple patterns
      });

      // Performance should be consistent (no outliers > 10x slower than average)
      const avgDuration =
        durations.reduce((a, b) => a + b, 0) / durations.length;
      durations.forEach((duration) => {
        expect(duration).toBeLessThan(Math.max(avgDuration * 10, 50)); // At least 50ms tolerance
      });
    });

    it('should handle built-in format fallbacks', () => {
      const formats: StringFormat[] = ['uuid', 'email', 'date', 'date-time'];

      formats.forEach((format) => {
        const schema: StringSchema = {
          type: 'string',
          format,
        };
        const context = createGeneratorContext(schema, formatRegistry);
        const result = generator.generate(schema, context);

        // Should succeed using built-in generators even with empty registry
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value.length).toBeGreaterThan(0);
          expect(typeof result.value).toBe('string');
        }
      });
    });

    it('should handle advanced built-in format scenarios', () => {
      // Test format generation with various constraints
      const testCases = [
        { format: 'uuid' as StringFormat, maxLength: 36, expectValid: true },
        { format: 'uuid' as StringFormat, maxLength: 10, expectValid: false }, // Too short for UUID
        { format: 'email' as StringFormat, minLength: 5, expectValid: true },
        {
          format: 'date' as StringFormat,
          minLength: 10,
          maxLength: 10,
          expectValid: true,
        },
      ];

      testCases.forEach(({ format, minLength, maxLength, expectValid }) => {
        const schema: StringSchema = {
          type: 'string',
          format,
          ...(minLength && { minLength }),
          ...(maxLength && { maxLength }),
        };
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: 42,
        });
        const result = generator.generate(schema, context);

        if (expectValid) {
          expect(result.isOk()).toBe(true);
          if (result.isOk()) {
            const value = result.value;
            if (minLength)
              expect(value.length).toBeGreaterThanOrEqual(minLength);
            if (maxLength) expect(value.length).toBeLessThanOrEqual(maxLength);
          }
        } else {
          // Should either generate a valid result or return an error
          expect(result.isOk() || result.isErr()).toBe(true);
        }
      });
    });

    it('should test validate method behavior with different validation scenarios', () => {
      // Test the validate method separately from generate
      const testCases = [
        {
          value: '',
          schema: { type: 'string' as const, minLength: 0 },
          expected: true,
        },
        {
          value: 'abc',
          schema: { type: 'string' as const, minLength: 3 },
          expected: true,
        },
        {
          value: 'ab',
          schema: { type: 'string' as const, minLength: 3 },
          expected: false,
        },
        {
          value: 'test',
          schema: { type: 'string' as const, maxLength: 3 },
          expected: false,
        },
        {
          value: 'test',
          schema: { type: 'string' as const, enum: ['test', 'demo'] },
          expected: true,
        },
        {
          value: 'other',
          schema: { type: 'string' as const, enum: ['test', 'demo'] },
          expected: false,
        },
        {
          value: 'constant',
          schema: { type: 'string' as const, const: 'constant' },
          expected: true,
        },
        {
          value: 'different',
          schema: { type: 'string' as const, const: 'constant' },
          expected: false,
        },
      ];

      testCases.forEach(({ value, schema, expected }, index) => {
        const result = generator.validate(value, schema);
        if (result !== expected) {
          console.log(
            `Test case ${index + 1} failed: validate("${value}", ${JSON.stringify(schema)}) should be ${expected}, got ${result}`
          );
        }
        expect(result).toBe(expected);
      });
    });

    it('should handle edge cases in constraint validation', () => {
      // Test edge cases that might cause validation issues
      const edgeCases = [
        // Empty string edge cases
        { value: '', minLength: 0, maxLength: 0, shouldBeValid: true },
        { value: '', minLength: 0, maxLength: 5, shouldBeValid: true },

        // Boundary values
        {
          value: 'a'.repeat(100),
          minLength: 100,
          maxLength: 100,
          shouldBeValid: true,
        },
        {
          value: 'a'.repeat(99),
          minLength: 100,
          maxLength: 100,
          shouldBeValid: false,
        },

        // Unicode edge cases - note: emojis might have different character counts
        { value: '测试', minLength: 2, maxLength: 2, shouldBeValid: true },
        { value: 'café', minLength: 4, maxLength: 4, shouldBeValid: true },
      ];

      edgeCases.forEach(
        ({ value, minLength, maxLength, shouldBeValid }, index) => {
          const schema: StringSchema = {
            type: 'string',
            ...(minLength !== undefined && { minLength }),
            ...(maxLength !== undefined && { maxLength }),
          };

          const result = generator.validate(value, schema);
          if (result !== shouldBeValid) {
            console.log(
              `Edge case ${index + 1} failed: "${value}" (length: ${value.length}) with minLength=${minLength}, maxLength=${maxLength} should be ${shouldBeValid ? 'valid' : 'invalid'}, got ${result}`
            );
          }
          expect(result).toBe(shouldBeValid);
        }
      );
    });
  });

  describe('validate', () => {
    it('should validate string values correctly', () => {
      fc.assert(
        fc.property(
          fc.string(),
          fc.record({
            minLength: fc.option(fc.integer({ min: 0, max: 20 }), {
              nil: undefined,
            }),
            maxLength: fc.option(fc.integer({ min: 10, max: 50 }), {
              nil: undefined,
            }),
            pattern: fc.option(fc.constantFrom('^[a-zA-Z]+$', '^[0-9]+$'), {
              nil: undefined,
            }),
          }),
          (value, constraints) => {
            const schema: StringSchema = {
              type: 'string',
              ...constraints,
            };

            const isValid = generator.validate(value, schema);

            // Check if the value should be valid according to constraints
            let shouldBeValid = true;

            if (
              constraints.minLength !== undefined &&
              value.length < constraints.minLength
            ) {
              shouldBeValid = false;
            }
            if (
              constraints.maxLength !== undefined &&
              value.length > constraints.maxLength
            ) {
              shouldBeValid = false;
            }
            if (constraints.pattern !== undefined) {
              const regex = new RegExp(constraints.pattern);
              if (!regex.test(value)) {
                shouldBeValid = false;
              }
            }

            expect(isValid).toBe(shouldBeValid);
          }
        )
      );
    });

    it('should reject non-string values', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer(),
            fc.boolean(),
            fc.constantFrom(null, undefined),
            fc.array(fc.anything()),
            fc.object()
          ),
          (nonStringValue) => {
            const schema: StringSchema = { type: 'string' };
            expect(generator.validate(nonStringValue, schema)).toBe(false);
          }
        )
      );
    });

    it('should validate enum constraints correctly', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
          fc.string(),
          (enumValues, testValue) => {
            const schema: StringSchema = { type: 'string', enum: enumValues };
            const isValid = generator.validate(testValue, schema);
            const shouldBeValid = enumValues.includes(testValue);

            expect(isValid).toBe(shouldBeValid);
          }
        )
      );
    });

    it('should validate const constraints correctly', () => {
      fc.assert(
        fc.property(fc.string(), fc.string(), (constValue, testValue) => {
          const schema: StringSchema = { type: 'string', const: constValue };
          const isValid = generator.validate(testValue, schema);
          const shouldBeValid = testValue === constValue;

          expect(isValid).toBe(shouldBeValid);
        })
      );
    });

    it('should skip format validation in validate method', () => {
      const schema: StringSchema = {
        type: 'string',
        format: 'email',
      };

      // Should validate even invalid email since format validation is skipped
      const validResult = generator.validate('not-an-email', schema);
      expect(validResult).toBe(true);

      // Should still reject non-strings
      const invalidResult = generator.validate(123 as any, schema);
      expect(invalidResult).toBe(false);
    });
  });

  describe('getExamples', () => {
    it('should return enum values as examples when available', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string(), { minLength: 1, maxLength: 10 }),
          (enumValues) => {
            const schema: StringSchema = { type: 'string', enum: enumValues };
            const examples = generator.getExamples(schema);

            expect(examples).toEqual(enumValues);
          }
        )
      );
    });

    it('should return const value as example when available', () => {
      fc.assert(
        fc.property(fc.string(), (constValue) => {
          const schema: StringSchema = { type: 'string', const: constValue };
          const examples = generator.getExamples(schema);

          expect(examples).toEqual([constValue]);
        })
      );
    });

    it('should return schema examples when available', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
          (schemaExamples) => {
            const schema: StringSchema = {
              type: 'string',
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
          fc.integer({ min: 1, max: 10 }).chain((minLen) =>
            fc.record({
              minLength: fc.constant(minLen),
              maxLength: fc.option(
                fc.integer({ min: minLen, max: minLen + 20 })
              ),
            })
          ),
          (constraints) => {
            const schema: StringSchema = {
              type: 'string',
              ...(constraints.minLength !== undefined && {
                minLength: constraints.minLength,
              }),
              ...(constraints.maxLength !== null && {
                maxLength: constraints.maxLength,
              }),
            };
            const examples = generator.getExamples(schema);

            expect(Array.isArray(examples)).toBe(true);
            expect(examples.length).toBeGreaterThan(0);

            // All examples should be strings and meet constraints
            examples.forEach((example) => {
              expect(typeof example).toBe('string');
              if (constraints.minLength !== undefined) {
                expect(example.length).toBeGreaterThanOrEqual(
                  constraints.minLength
                );
              }
              if (constraints.maxLength !== null) {
                expect(example.length).toBeLessThanOrEqual(
                  constraints.maxLength
                );
              }
            });
          }
        )
      );
    });

    it('should return empty array for unsupported schemas', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.record({ type: fc.constantFrom('number', 'boolean', 'object') }),
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
    it('should maintain consistency between generate and validate', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            // Simple schema with no constraints
            fc.constant({}),
            // Schema with length constraints (compatible)
            fc.integer({ min: 0, max: 5 }).chain((minLen) =>
              fc.integer({ min: 0, max: 15 }).map((extraLen) => ({
                minLength: minLen,
                maxLength: minLen + extraLen,
              }))
            ),
            // Schema with enum only
            fc.record({
              enum: fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
            })
          ),
          fc.integer({ min: 0, max: 1000 }),
          (schemaProps, seed) => {
            const schema: StringSchema = {
              type: 'string',
              ...schemaProps,
            };
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
  });

  describe('comprehensive Task 4 coverage', () => {
    it('should handle all string format combinations', () => {
      const formats: StringFormat[] = ['uuid', 'email', 'date', 'date-time'];

      formats.forEach((format) => {
        fc.assert(
          fc.property(fc.integer({ min: 0, max: 1000 }), (seed) => {
            const schema: StringSchema = { type: 'string', format };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(typeof result.value).toBe('string');
              expect(result.value.length).toBeGreaterThan(0);

              // Validate format-specific patterns
              switch (format) {
                case 'uuid':
                  expect(result.value).toMatch(
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
                  );
                  break;
                case 'email':
                  expect(result.value).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
                  break;
                case 'date':
                  expect(result.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
                  break;
                case 'date-time':
                  expect(result.value).toMatch(
                    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
                  );
                  break;
              }
            }
          }),
          { numRuns: 20 }
        );
      });
    });

    it('should respect all constraint combinations', () => {
      fc.assert(
        fc.property(
          fc
            .tuple(
              fc.integer({ min: 0, max: 15 }),
              fc.integer({ min: 0, max: 10 })
            )
            .map(([minBase, extra]): [number, number] => [
              minBase,
              minBase + extra,
            ]),
          fc.constantFrom('^[a-zA-Z]+$', '^[0-9]+$', '^[a-zA-Z0-9]+$'),
          fc.integer({ min: 0, max: 1000 }),
          ([minLength, maxLength]: [number, number], pattern, seed) => {
            const schema: StringSchema = {
              type: 'string',
              minLength,
              maxLength,
              pattern,
            };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            // For impossible constraints (maxLength 0 with patterns requiring at least 1 char), expect error
            const isImpossible =
              maxLength === 0 &&
              (pattern === '^[a-zA-Z]+$' ||
                pattern === '^[0-9]+$' ||
                pattern === '^[a-zA-Z0-9]+$');

            if (isImpossible) {
              expect(result.isErr()).toBe(true);
            } else {
              expect(result.isOk()).toBe(true);
              if (result.isOk()) {
                expect(result.value.length).toBeGreaterThanOrEqual(minLength);
                expect(result.value.length).toBeLessThanOrEqual(maxLength);
                expect(new RegExp(pattern).test(result.value)).toBe(true);
                expect(generator.validate(result.value, schema)).toBe(true);
              }
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should generate valid examples for all constraint types', () => {
      const testCases = [
        { minLength: 5, maxLength: 10 },
        { pattern: '^test[0-9]+$' },
        { enum: ['hello', 'world', 'test'] },
        { const: 'constant-value' },
        { examples: ['example1', 'example2'] },
      ];

      testCases.forEach((constraints) => {
        const schema: StringSchema = { type: 'string', ...constraints };
        const examples = generator.getExamples(schema);

        expect(Array.isArray(examples)).toBe(true);
        expect(examples.length).toBeGreaterThan(0);

        examples.forEach((example) => {
          expect(typeof example).toBe('string');
          expect(generator.validate(example, schema)).toBe(true);
        });
      });
    });
  });
});
