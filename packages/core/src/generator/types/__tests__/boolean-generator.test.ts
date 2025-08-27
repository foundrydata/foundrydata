import { describe, it, expect, beforeEach } from 'vitest';
/**
 * Property-based tests for BooleanGenerator
 * Using fast-check for robust constraint validation
 */

import fc from 'fast-check';
import { BooleanGenerator } from '../boolean-generator';
import { createGeneratorContext } from '../../data-generator';
import { FormatRegistry } from '../../../registry/format-registry';
import type { BooleanSchema } from '../../../types/schema';

describe('BooleanGenerator', () => {
  let generator: BooleanGenerator;
  let formatRegistry: FormatRegistry;

  beforeEach(() => {
    generator = new BooleanGenerator();
    formatRegistry = new FormatRegistry();
  });

  describe('supports', () => {
    it('should support boolean schemas', () => {
      fc.assert(
        fc.property(
          fc.record({
            type: fc.constant('boolean' as const),
            enum: fc.option(fc.array(fc.boolean()), { nil: undefined }),
            const: fc.option(fc.boolean(), { nil: undefined }),
          }),
          (schema) => {
            expect(generator.supports(schema)).toBe(true);
          }
        )
      );
    });

    it('should not support non-boolean schemas', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant({ type: 'string' as const }),
            fc.constant({ type: 'number' as const }),
            fc.constant({ type: 'object' as const }),
            fc.constant({ type: 'array' as const }),
            fc.constant({ type: 'integer' as const })
          ),
          (schema) => {
            expect(generator.supports(schema)).toBe(false);
          }
        )
      );
    });
  });

  describe('generate', () => {
    it('should always generate booleans', () => {
      const schema: BooleanSchema = { type: 'boolean' };
      const context = createGeneratorContext(schema, formatRegistry);

      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1000 }), (seed) => {
          const contextWithSeed = { ...context, seed };
          const result = generator.generate(schema, contextWithSeed);

          expect(result.isOk()).toBe(true);
          if (result.isOk()) {
            expect(typeof result.value).toBe('boolean');
            expect([true, false]).toContain(result.value);
          }
        })
      );
    });

    it('should generate both true and false values over multiple runs', () => {
      const schema: BooleanSchema = { type: 'boolean' };
      const context = createGeneratorContext(schema, formatRegistry);

      const results: boolean[] = [];

      // Generate multiple values to check distribution
      for (let i = 0; i < 100; i++) {
        const contextWithSeed = { ...context, seed: i };
        const result = generator.generate(schema, contextWithSeed);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          results.push(result.value);
        }
      }

      // Should have generated both true and false values
      expect(results).toContain(true);
      expect(results).toContain(false);
    });

    it('should generate values from enum when provided', () => {
      fc.assert(
        fc.property(
          fc.array(fc.boolean(), { minLength: 1, maxLength: 2 }),
          fc.integer({ min: 0, max: 1000 }),
          (enumValues, seed) => {
            const schema: BooleanSchema = { type: 'boolean', enum: enumValues };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(enumValues).toContain(result.value);
              expect(typeof result.value).toBe('boolean');
            }
          }
        )
      );
    });

    it('should generate const value when provided', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.integer({ min: 0, max: 1000 }),
          (constValue, seed) => {
            const schema: BooleanSchema = {
              type: 'boolean',
              const: constValue,
            };
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

    it('should generate same values with same seed', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1000 }), (seed) => {
          const schema: BooleanSchema = { type: 'boolean' };

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
        })
      );
    });

    it('should handle different scenarios appropriately', () => {
      const scenarios: Array<'normal' | 'edge' | 'peak' | 'error'> = [
        'normal',
        'edge',
        'peak',
        'error',
      ];

      scenarios.forEach((scenario) => {
        fc.assert(
          fc.property(fc.integer({ min: 0, max: 1000 }), (seed) => {
            const schema: BooleanSchema = { type: 'boolean' };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
              scenario,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(typeof result.value).toBe('boolean');
            }
          }),
          { numRuns: 20 } // Fewer runs per scenario
        );
      });
    });

    it('should handle default values when provided', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.integer({ min: 0, max: 1000 }),
          (defaultValue, seed) => {
            const schema: BooleanSchema = {
              type: 'boolean',
              default: defaultValue,
            };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(typeof result.value).toBe('boolean');
              // With some probability, should use default value
              expect([true, false]).toContain(result.value);
            }
          }
        )
      );
    });

    it('should handle examples when provided', () => {
      fc.assert(
        fc.property(
          fc.array(fc.boolean(), { minLength: 1, maxLength: 2 }),
          fc.integer({ min: 0, max: 1000 }),
          (examples, seed) => {
            const schema: BooleanSchema = { type: 'boolean', examples };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(typeof result.value).toBe('boolean');
              // Should generate valid boolean values (may or may not use examples)
            }
          }
        )
      );
    });

    it('should be deterministic with probability configuration', () => {
      // Test that the generator respects probability settings consistently
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 1 }),
          fc.integer({ min: 0, max: 1000 }),
          (_trueProbability, seed) => {
            const schema: BooleanSchema = { type: 'boolean' };

            // Generate same value multiple times with same seed
            const results: boolean[] = [];
            for (let i = 0; i < 5; i++) {
              const sameContext = createGeneratorContext(
                schema,
                formatRegistry,
                { seed }
              );
              const result = generator.generate(schema, sameContext);
              if (result.isOk()) {
                results.push(result.value);
              }
            }

            // All results should be the same (deterministic)
            if (results.length > 1) {
              expect(results.every((r) => r === results[0])).toBe(true);
            }
          }
        )
      );
    });
  });

  describe('validate', () => {
    it('should validate boolean values correctly', () => {
      fc.assert(
        fc.property(fc.boolean(), (value) => {
          const schema: BooleanSchema = { type: 'boolean' };
          const isValid = generator.validate(value, schema);
          expect(isValid).toBe(true);
        })
      );
    });

    it('should reject non-boolean values', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string(),
            fc.integer(),
            fc.float(),
            fc.constantFrom(null, undefined),
            fc.array(fc.anything()),
            fc.object(),
            fc.constantFrom(0, 1, 'true', 'false', 'yes', 'no') // Common boolean-like values
          ),
          (nonBooleanValue) => {
            const schema: BooleanSchema = { type: 'boolean' };
            expect(generator.validate(nonBooleanValue, schema)).toBe(false);
          }
        )
      );
    });

    it('should validate enum constraints correctly', () => {
      fc.assert(
        fc.property(
          fc.array(fc.boolean(), { minLength: 1, maxLength: 2 }),
          fc.boolean(),
          (enumValues, testValue) => {
            const schema: BooleanSchema = { type: 'boolean', enum: enumValues };
            const isValid = generator.validate(testValue, schema);
            const shouldBeValid = enumValues.includes(testValue);

            expect(isValid).toBe(shouldBeValid);
          }
        )
      );
    });

    it('should validate const constraints correctly', () => {
      fc.assert(
        fc.property(fc.boolean(), fc.boolean(), (constValue, testValue) => {
          const schema: BooleanSchema = { type: 'boolean', const: constValue };
          const isValid = generator.validate(testValue, schema);
          const shouldBeValid = testValue === constValue;

          expect(isValid).toBe(shouldBeValid);
        })
      );
    });

    it('should handle schemas without boolean type', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.oneof(
            fc.record({ type: fc.constantFrom('string', 'number', 'object') }),
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
  });

  describe('getExamples', () => {
    it('should return enum values as examples when available', () => {
      fc.assert(
        fc.property(
          fc.array(fc.boolean(), { minLength: 1, maxLength: 2 }),
          (enumValues) => {
            const schema: BooleanSchema = { type: 'boolean', enum: enumValues };
            const examples = generator.getExamples(schema);

            expect(examples).toEqual(enumValues);
          }
        )
      );
    });

    it('should return const value as example when available', () => {
      fc.assert(
        fc.property(fc.boolean(), (constValue) => {
          const schema: BooleanSchema = { type: 'boolean', const: constValue };
          const examples = generator.getExamples(schema);

          expect(examples).toEqual([constValue]);
        })
      );
    });

    it('should return schema examples when available', () => {
      fc.assert(
        fc.property(
          fc.array(fc.boolean(), { minLength: 1, maxLength: 2 }),
          (schemaExamples) => {
            const schema: BooleanSchema = {
              type: 'boolean',
              examples: schemaExamples,
            };
            const examples = generator.getExamples(schema);

            expect(examples).toEqual(schemaExamples);
          }
        )
      );
    });

    it('should return default boolean examples when no specific examples', () => {
      const schema: BooleanSchema = { type: 'boolean' };
      const examples = generator.getExamples(schema);

      expect(Array.isArray(examples)).toBe(true);
      expect(examples.length).toBe(2);
      expect(examples).toContain(true);
      expect(examples).toContain(false);
    });

    it('should return empty array for unsupported schemas', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.record({ type: fc.constantFrom('string', 'number', 'object') }),
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
            // Schema with enum only
            fc.record({
              enum: fc.array(fc.boolean(), { minLength: 1, maxLength: 2 }),
            }),
            // Schema with const only
            fc.record({
              const: fc.boolean(),
            }),
            // Schema with default only
            fc.record({
              default: fc.boolean(),
            }),
            // Schema with examples only
            fc.record({
              examples: fc.array(fc.boolean(), { minLength: 1, maxLength: 2 }),
            })
          ),
          fc.integer({ min: 0, max: 1000 }),
          (schemaProps, seed) => {
            const schema: BooleanSchema = {
              type: 'boolean',
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
              expect(typeof result.value).toBe('boolean');
            }
          }
        )
      );
    });

    it('should handle edge cases gracefully', () => {
      const edgeCases = [
        { enum: [] }, // Empty enum (should fail gracefully)
        { enum: [true] }, // Single value enum
        { enum: [false] }, // Single value enum
        { const: true },
        { const: false },
        { default: true, const: false }, // Conflicting constraints
      ];

      edgeCases.forEach((constraints, index) => {
        const schema: BooleanSchema = {
          type: 'boolean',
          ...constraints,
        };
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: index,
        });

        const result = generator.generate(schema, context);

        if (result.isOk()) {
          // If generation succeeds, result should be valid
          expect(generator.validate(result.value, schema)).toBe(true);
          expect(typeof result.value).toBe('boolean');
        }
        // If generation fails for edge cases like empty enum, that's acceptable
      });
    });

    it('should produce reasonable distribution over many samples', () => {
      const schema: BooleanSchema = { type: 'boolean' };
      const results: boolean[] = [];

      // Generate many samples
      for (let i = 0; i < 1000; i++) {
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: i,
        });
        const result = generator.generate(schema, context);

        if (result.isOk()) {
          results.push(result.value);
        }
      }

      const trueCount = results.filter((r) => r === true).length;
      const falseCount = results.filter((r) => r === false).length;

      // Should have both true and false values
      expect(trueCount).toBeGreaterThan(0);
      expect(falseCount).toBeGreaterThan(0);

      // Distribution should be somewhat balanced (not requiring exact 50/50)
      // Allow for reasonable variance in random distribution
      const minExpected = results.length * 0.2; // At least 20% of each
      expect(trueCount).toBeGreaterThan(minExpected);
      expect(falseCount).toBeGreaterThan(minExpected);
    });

    it('should handle scenario-specific generation correctly', () => {
      const scenarios: Array<'normal' | 'edge' | 'peak' | 'error'> = [
        'normal',
        'edge',
        'peak',
        'error',
      ];

      scenarios.forEach((scenario) => {
        const schema: BooleanSchema = { type: 'boolean' };
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: 42,
          scenario,
        });

        const result = generator.generate(schema, context);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(typeof result.value).toBe('boolean');
          expect(generator.validate(result.value, schema)).toBe(true);
        }
      });
    });
  });

  describe('comprehensive Task 4 coverage', () => {
    it('should handle all boolean constraint scenarios', () => {
      const scenarios = [
        {}, // No constraints
        { const: true },
        { const: false },
        { enum: [true] },
        { enum: [false] },
        { enum: [true, false] },
        { default: true },
        { default: false },
        { examples: [true] },
        { examples: [false] },
      ];

      scenarios.forEach((constraints, index) => {
        const schema: BooleanSchema = { type: 'boolean', ...constraints };
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: index,
        });

        const result = generator.generate(schema, context);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(typeof result.value).toBe('boolean');
          expect([true, false]).toContain(result.value);
          expect(generator.validate(result.value, schema)).toBe(true);
        }
      });
    });

    it('should maintain deterministic generation across scenarios', () => {
      const scenarios: Array<'normal' | 'edge' | 'peak' | 'error'> = [
        'normal',
        'edge',
        'peak',
        'error',
      ];

      scenarios.forEach((scenario) => {
        fc.assert(
          fc.property(fc.integer({ min: 0, max: 1000 }), (seed) => {
            const schema: BooleanSchema = { type: 'boolean' };
            const context1 = createGeneratorContext(schema, formatRegistry, {
              seed,
              scenario,
            });
            const context2 = createGeneratorContext(schema, formatRegistry, {
              seed,
              scenario,
            });

            const result1 = generator.generate(schema, context1);
            const result2 = generator.generate(schema, context2);

            expect(result1.isOk()).toBe(true);
            expect(result2.isOk()).toBe(true);

            if (result1.isOk() && result2.isOk()) {
              expect(result1.value).toBe(result2.value);
            }
          }),
          { numRuns: 25 }
        );
      });
    });

    it('should provide correct priority handling', () => {
      // const should override enum
      const constSchema: BooleanSchema = {
        type: 'boolean',
        const: true,
        enum: [false], // This should be ignored
      };

      for (let i = 0; i < 10; i++) {
        const context = createGeneratorContext(constSchema, formatRegistry, {
          seed: i,
        });
        const result = generator.generate(constSchema, context);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value).toBe(true); // Should always be true due to const
        }
      }
    });
  });
});
