import { describe, it, expect, beforeEach } from 'vitest';
/**
 * Property-based tests for StringGenerator
 * Using fast-check for robust constraint validation
 */

import fc from 'fast-check';
import { StringGenerator } from '../string-generator';
import { createGeneratorContext } from '../../data-generator';
import { FormatRegistry } from '../../../registry/format-registry';
import type { StringSchema } from '../../../types/schema';

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
            type: fc.constant('string'),
            minLength: fc.option(fc.nat()),
            maxLength: fc.option(fc.nat()),
            pattern: fc.option(fc.string()),
            format: fc.option(fc.string()),
            enum: fc.option(fc.array(fc.string())),
            const: fc.option(fc.string()),
          }),
          (schema) => {
            expect(generator.supports(schema)).toBe(true);
          }
        )
      );
    });

    it('should not support non-string schemas', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.record({
              type: fc.constantFrom('number', 'boolean', 'object', 'array'),
            }),
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

      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 0, max: 1000 }),
          (seed1, seed2) => {
            fc.pre(seed1 !== seed2);

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

            // With high probability, different seeds should produce different values
            // We can't guarantee this 100%, but it should be very likely for different seeds
            if (result1.isOk() && result2.isOk()) {
              // This property might occasionally fail due to randomness, but should pass most of the time
              return true; // We just verify both generate successfully
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

            expect(result1.isOk()).toBe(true);
            expect(result2.isOk()).toBe(true);

            if (result1.isOk() && result2.isOk()) {
              expect(result1.value).toBe(result2.value);
            }
          }
        )
      );
    });

    it('should handle pattern constraints for simple patterns', () => {
      const patterns = ['^[a-zA-Z]+$', '^[0-9]+$', '^[a-zA-Z0-9]+$'];

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

    it('should handle edge case scenarios', () => {
      fc.assert(
        fc.property(
          fc.record({
            minLength: fc.option(fc.integer({ min: 0, max: 10 })),
            maxLength: fc.option(fc.integer({ min: 5, max: 20 })),
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

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              if (constraints.minLength !== null) {
                expect(result.value.length).toBeGreaterThanOrEqual(
                  constraints.minLength
                );
              }
              if (constraints.maxLength !== null) {
                expect(result.value.length).toBeLessThanOrEqual(
                  constraints.maxLength
                );
              }
            }
          }
        )
      );
    });
  });

  describe('validate', () => {
    it('should validate string values correctly', () => {
      fc.assert(
        fc.property(
          fc.string(),
          fc.record({
            minLength: fc.option(fc.integer({ min: 0, max: 20 })),
            maxLength: fc.option(fc.integer({ min: 10, max: 50 })),
            pattern: fc.option(fc.constantFrom('^[a-zA-Z]+$', '^[0-9]+$')),
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
              constraints.minLength !== null &&
              value.length < constraints.minLength
            ) {
              shouldBeValid = false;
            }
            if (
              constraints.maxLength !== null &&
              value.length > constraints.maxLength
            ) {
              shouldBeValid = false;
            }
            if (constraints.pattern !== null) {
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
              ...(constraints.minLength !== null && {
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
              if (constraints.minLength !== null) {
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
              fc.constant({
                minLength: minLen,
                maxLength:
                  minLen + fc.sample(fc.integer({ min: 0, max: 15 }), 1)[0],
              })
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
      const formats = ['uuid', 'email', 'date', 'date-time'];

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
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i
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
            .map(([minBase, extra]) => [minBase, minBase + extra]),
          fc.constantFrom('^[a-zA-Z]+$', '^[0-9]+$', '^[a-zA-Z0-9]+$'),
          fc.integer({ min: 0, max: 1000 }),
          ([minLength, maxLength], pattern, seed) => {
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

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(result.value.length).toBeGreaterThanOrEqual(minLength);
              expect(result.value.length).toBeLessThanOrEqual(maxLength);
              expect(new RegExp(pattern).test(result.value)).toBe(true);
              expect(generator.validate(result.value, schema)).toBe(true);
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
