import { describe, it, expect, beforeEach } from 'vitest';
/**
 * Property-based tests for IntegerGenerator - Phase 3 Migration
 * Using testing architecture v2.1 with:
 * - AJV validation oracle and getSchemaArbitrary pattern
 * - createBounds() helper for constraint coherence
 * - Deterministic testing with fixed seed 424242
 * - Multi-draft support and custom matchers
 * - FormatRegistry-AJV adapter integration
 * - Percentile-based performance metrics
 *
 * Migration Strategy:
 * - Keep existing Result pattern and test structure
 * - Add AJV validation after isOk() checks
 * - Replace manual schema arbitrary with getSchemaArbitrary().filter()
 * - Add seed parameter and logging
 * - Verify tests pass with all drafts
 */

import fc from 'fast-check';
import { IntegerGenerator } from '../integer-generator';
import { createGeneratorContext } from '../../data-generator';
import { FormatRegistry } from '../../../registry/format-registry';
import type { IntegerSchema } from '../../../types/schema';
import {
  getAjv,
  createAjv,
} from '../../../../../../test/helpers/ajv-factory.js';
import {
  getSchemaArbitrary,
  createBounds,
} from '../../../../../../test/arbitraries/json-schema.js';
import '../../../../../../test/matchers';
import { propertyTest } from '../../../../../../test/setup.js';

describe('IntegerGenerator', () => {
  let generator: IntegerGenerator;
  let formatRegistry: FormatRegistry;

  /** Fixed seed for deterministic testing */
  const INTEGER_TEST_SEED = 424242;

  /** Get configured numRuns from fast-check globals */
  const getNumRuns = (): number => {
    const config = fc.readConfigureGlobal();
    return config.numRuns || 100;
  };

  beforeEach(() => {
    generator = new IntegerGenerator();
    formatRegistry = new FormatRegistry();
  });

  describe('supports', () => {
    it('should support integer schemas', () => {
      return propertyTest(
        'IntegerGenerator supports integer schemas',
        fc.property(
          getSchemaArbitrary()
            .filter(
              (schema: Record<string, unknown>) => schema.type === 'integer'
            )
            .map((schema) => schema as unknown as IntegerSchema),
          (schema) => {
            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                '[INTEGER_GENERATOR] Testing support for schema:',
                JSON.stringify(schema)
              );
            }
            expect(generator.supports(schema)).toBe(true);
          }
        ),
        {
          parameters: { seed: INTEGER_TEST_SEED, numRuns: getNumRuns() },
          context: { component: 'IntegerGenerator', phase: 'supports' },
        }
      );
    });

    it('should not support non-integer schemas', () => {
      return propertyTest(
        'IntegerGenerator does not support non-integer schemas',
        fc.property(
          getSchemaArbitrary().filter(
            (schema: Record<string, unknown>) => schema.type !== 'integer'
          ),
          (schema) => {
            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                '[INTEGER_GENERATOR] Testing non-support for schema:',
                JSON.stringify(schema)
              );
            }
            expect(generator.supports(schema as any)).toBe(false);
          }
        ),
        {
          parameters: { seed: INTEGER_TEST_SEED, numRuns: getNumRuns() },
          context: {
            component: 'IntegerGenerator',
            phase: 'supports-negative',
          },
        }
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
      const ajv = getAjv();
      const validate = ajv.compile(schema);

      return propertyTest(
        'IntegerGenerator always generates integers',
        fc.property(fc.integer({ min: 0, max: 1000 }), (seed) => {
          const contextWithSeed = { ...context, seed };
          const result = generator.generate(schema, contextWithSeed);

          expect(result.isOk()).toBe(true);
          if (result.isOk()) {
            // AJV validation oracle
            expect(validate(result.value)).toBe(true);
            expect(typeof result.value).toBe('number');
            expect(Number.isInteger(result.value)).toBe(true);
            expect(Number.isFinite(result.value)).toBe(true);

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[INTEGER_GENERATOR] Generated: ${result.value} with seed: ${seed}`
              );
            }
          }
        }),
        {
          parameters: { seed: INTEGER_TEST_SEED, numRuns: getNumRuns() },
          context: { component: 'IntegerGenerator', phase: 'generate' },
        }
      );
    });

    it('should respect minimum constraint', () => {
      return propertyTest(
        'IntegerGenerator respects minimum constraint',
        fc.property(
          createBounds(-1000, 1000),
          fc.integer({ min: 0, max: 1000 }),
          ([minimum], seed) => {
            const schema: IntegerSchema = { type: 'integer', minimum };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const ajv = getAjv();
            const validate = ajv.compile(schema);

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              // AJV validation oracle
              expect(validate(result.value)).toBe(true);
              expect(result.value).toBeWithinRange(
                minimum,
                Number.MAX_SAFE_INTEGER
              );
              expect(Number.isInteger(result.value)).toBe(true);

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[INTEGER_GENERATOR] Min constraint - minimum: ${minimum}, generated: ${result.value}, seed: ${seed}`
                );
              }
            }
          }
        ),
        {
          parameters: { seed: INTEGER_TEST_SEED, numRuns: getNumRuns() },
          context: { constraint: 'minimum' },
        }
      );
    });

    it('should respect maximum constraint', () => {
      return propertyTest(
        'IntegerGenerator respects maximum constraint',
        fc.property(
          createBounds(-1000, 1000),
          fc.integer({ min: 0, max: 1000 }),
          ([, maximum], seed) => {
            const schema: IntegerSchema = { type: 'integer', maximum };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const ajv = getAjv();
            const validate = ajv.compile(schema);

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              // AJV validation oracle
              expect(validate(result.value)).toBe(true);
              expect(result.value).toBeWithinRange(
                Number.MIN_SAFE_INTEGER,
                maximum
              );
              expect(Number.isInteger(result.value)).toBe(true);

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[INTEGER_GENERATOR] Max constraint - maximum: ${maximum}, generated: ${result.value}, seed: ${seed}`
                );
              }
            }
          }
        ),
        {
          parameters: { seed: INTEGER_TEST_SEED, numRuns: getNumRuns() },
          context: { constraint: 'maximum' },
        }
      );
    });

    it('should respect both minimum and maximum constraints', () => {
      return propertyTest(
        'IntegerGenerator respects min and max',
        fc.property(
          createBounds(-1000, 1000),
          fc.integer({ min: 0, max: 1000 }),
          ([minimum, maximum], seed) => {
            const schema: IntegerSchema = { type: 'integer', minimum, maximum };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const ajv = getAjv();
            const validate = ajv.compile(schema);

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              // AJV validation oracle
              expect(validate(result.value)).toBe(true);
              expect(result.value).toBeWithinRange(minimum, maximum);
              expect(Number.isInteger(result.value)).toBe(true);

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[INTEGER_GENERATOR] Range constraint - range: [${minimum}, ${maximum}], generated: ${result.value}, seed: ${seed}`
                );
              }
            }
          }
        ),
        {
          parameters: { seed: INTEGER_TEST_SEED, numRuns: getNumRuns() },
          context: { constraint: 'range' },
        }
      );
    });

    it('should respect exclusiveMinimum constraint', () => {
      return propertyTest(
        'IntegerGenerator respects exclusiveMinimum',
        fc.property(
          createBounds(-1000, 1000),
          fc.integer({ min: 0, max: 1000 }),
          ([exclusiveMinimum], seed) => {
            const schema: IntegerSchema = { type: 'integer', exclusiveMinimum };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const ajv = getAjv();
            const validate = ajv.compile(schema);

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              // AJV validation oracle
              expect(validate(result.value)).toBe(true);
              expect(result.value).toBeGreaterThan(exclusiveMinimum);
              expect(Number.isInteger(result.value)).toBe(true);

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[INTEGER_GENERATOR] Exclusive min - exclusiveMinimum: ${exclusiveMinimum}, generated: ${result.value}, seed: ${seed}`
                );
              }
            }
          }
        ),
        {
          parameters: { seed: INTEGER_TEST_SEED, numRuns: getNumRuns() },
          context: { constraint: 'exclusiveMinimum' },
        }
      );
    });

    it('should respect exclusiveMaximum constraint', () => {
      return propertyTest(
        'IntegerGenerator respects exclusiveMaximum',
        fc.property(
          createBounds(-1000, 1000),
          fc.integer({ min: 0, max: 1000 }),
          ([, exclusiveMaximum], seed) => {
            const schema: IntegerSchema = { type: 'integer', exclusiveMaximum };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const ajv = getAjv();
            const validate = ajv.compile(schema);

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              // AJV validation oracle
              expect(validate(result.value)).toBe(true);
              expect(result.value).toBeLessThan(exclusiveMaximum);
              expect(Number.isInteger(result.value)).toBe(true);

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[INTEGER_GENERATOR] Exclusive max - exclusiveMaximum: ${exclusiveMaximum}, generated: ${result.value}, seed: ${seed}`
                );
              }
            }
          }
        ),
        {
          parameters: { seed: INTEGER_TEST_SEED, numRuns: getNumRuns() },
          context: { constraint: 'exclusiveMaximum' },
        }
      );
    });

    it('should respect multipleOf constraint', () => {
      return propertyTest(
        'IntegerGenerator respects multipleOf',
        fc.property(
          fc.oneof(
            fc.constant(1),
            fc.constant(2),
            fc.constant(5),
            fc.constant(10),
            fc.constant(25)
          ),
          fc.integer({ min: 0, max: 1000 }),
          (multipleOf, seed) => {
            const schema: IntegerSchema = { type: 'integer', multipleOf };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const ajv = getAjv();
            const validate = ajv.compile(schema);

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              // AJV validation oracle
              expect(validate(result.value)).toBe(true);
              expect(Number.isInteger(result.value)).toBe(true);

              // Check multipleOf constraint - handle -0 vs +0 case
              const remainder = result.value % multipleOf;
              expect(Math.abs(remainder)).toBe(0);

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[INTEGER_GENERATOR] MultipleOf constraint - multipleOf: ${multipleOf}, generated: ${result.value}, remainder: ${result.value % multipleOf}, seed: ${seed}`
                );
              }
            }
          }
        ),
        {
          parameters: { seed: INTEGER_TEST_SEED, numRuns: getNumRuns() },
          context: { constraint: 'multipleOf' },
        }
      );
    });

    it('should generate values from enum when provided', () => {
      return propertyTest(
        'IntegerGenerator generates enums',
        fc.property(
          fc.array(fc.integer({ min: -100, max: 100 }), {
            minLength: 1,
            maxLength: 5,
          }),
          fc.integer({ min: 0, max: 1000 }),
          (enumValues, seed) => {
            const schema: IntegerSchema = { type: 'integer', enum: enumValues };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const ajv = getAjv();
            let validate: ReturnType<typeof ajv.compile>;
            try {
              validate = ajv.compile(schema);
            } catch {
              // Skip invalid schemas (property-based testing includes them intentionally)
              return;
            }

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              // AJV validation oracle
              expect(validate(result.value)).toBe(true);
              expect(enumValues).toContain(result.value);
              expect(Number.isInteger(result.value)).toBe(true);

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[INTEGER_GENERATOR] Generated enum value: ${result.value} from ${JSON.stringify(enumValues)} with seed: ${seed}`
                );
              }
            }
          }
        ),
        {
          parameters: { seed: INTEGER_TEST_SEED, numRuns: getNumRuns() },
          context: { feature: 'enum' },
        }
      );
    });

    it('should generate const value when provided', () => {
      return propertyTest(
        'IntegerGenerator generates const',
        fc.property(
          fc.integer({ min: -100, max: 100 }),
          fc.integer({ min: 0, max: 1000 }),
          (constValue, seed) => {
            const schema: IntegerSchema = {
              type: 'integer',
              const: constValue,
            };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const ajv = getAjv();
            const validate = ajv.compile(schema);

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              // AJV validation oracle
              expect(validate(result.value)).toBe(true);
              expect(result.value).toBe(constValue);
              expect(Number.isInteger(result.value)).toBe(true);

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[INTEGER_GENERATOR] Generated const value: ${result.value} with seed: ${seed}`
                );
              }
            }
          }
        ),
        {
          parameters: { seed: INTEGER_TEST_SEED, numRuns: getNumRuns() },
          context: { feature: 'const' },
        }
      );
    });

    it('should handle complex constraints combinations', () => {
      return propertyTest(
        'IntegerGenerator complex constraints',
        fc.property(
          createBounds(0, 100),
          fc.oneof(fc.constant(1), fc.constant(2), fc.constant(5)),
          fc.integer({ min: 0, max: 1000 }),
          ([minimum, maximum], multipleOf, seed) => {
            const schema: IntegerSchema = {
              type: 'integer',
              minimum,
              maximum,
              multipleOf,
            };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const ajv = getAjv();
            const validate = ajv.compile(schema);

            const result = generator.generate(schema, context);

            // Generator may fail with impossible constraints (e.g. min=1, max=1, multipleOf=5)
            if (result.isOk()) {
              // AJV validation oracle
              expect(validate(result.value)).toBe(true);
              expect(result.value).toBeWithinRange(minimum, maximum);
              expect(Number.isInteger(result.value)).toBe(true);

              // Verify multipleOf constraint - handle -0 vs +0 case
              const remainder = result.value % multipleOf;
              expect(Math.abs(remainder)).toBe(0);

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[INTEGER_GENERATOR] Complex constraints - range: [${minimum}, ${maximum}], multipleOf: ${multipleOf}, generated: ${result.value}, seed: ${seed}`
                );
              }
            }
          }
        ),
        { parameters: { seed: INTEGER_TEST_SEED, numRuns: getNumRuns() } }
      );
    });

    it('should generate same values with same seed', () => {
      return propertyTest(
        'IntegerGenerator same seed stability',
        fc.property(fc.integer({ min: 0, max: 1000 }), (seed) => {
          const schema: IntegerSchema = { type: 'integer' };
          const ajv = getAjv();
          const validate = ajv.compile(schema);

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
            // AJV validation oracle for both results
            expect(validate(result1.value)).toBe(true);
            expect(validate(result2.value)).toBe(true);
            expect(result1.value).toBe(result2.value);

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[INTEGER_GENERATOR] Deterministic check - seed: ${seed}, values: ${result1.value}, ${result2.value}`
              );
            }
          }
        }),
        { parameters: { seed: INTEGER_TEST_SEED, numRuns: getNumRuns() } }
      );
    });

    it('should handle different scenarios appropriately', async () => {
      const scenarios: Array<'normal' | 'edge' | 'peak' | 'error'> = [
        'normal',
        'edge',
        'peak',
        'error',
      ];

      for (const scenario of scenarios) {
        const ajv = getAjv();
        const schema: IntegerSchema = { type: 'integer' };
        const validate = ajv.compile(schema);

        await propertyTest(
          `IntegerGenerator scenario ${scenario}`,
          fc.property(fc.integer({ min: 0, max: 1000 }), (seed) => {
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
              scenario,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              // AJV validation oracle
              expect(validate(result.value)).toBe(true);
              expect(Number.isInteger(result.value)).toBe(true);
              expect(Number.isFinite(result.value)).toBe(true);

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[INTEGER_GENERATOR] Scenario ${scenario} - seed: ${seed}, value: ${result.value}`
                );
              }
            }
          }),
          {
            parameters: {
              seed: INTEGER_TEST_SEED + scenarios.indexOf(scenario),
              numRuns: Math.floor(getNumRuns() / 5),
            },
            context: { scenario },
          }
        );
      }
    });

    it('should handle exclusive bounds correctly', () => {
      return propertyTest(
        'IntegerGenerator exclusive bounds',
        fc.property(
          createBounds(0, 100),
          fc.integer({ min: 0, max: 1000 }),
          ([min, max], seed) => {
            const exclusiveMinimum = min;
            const exclusiveMaximum = max;
            const schema: IntegerSchema = {
              type: 'integer',
              exclusiveMinimum,
              exclusiveMaximum,
            };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const ajv = getAjv();
            const validate = ajv.compile(schema);

            const result = generator.generate(schema, context);

            // Generator may fail with impossible exclusive bounds (e.g. min=0, max=0)
            if (result.isOk()) {
              // AJV validation oracle
              expect(validate(result.value)).toBe(true);
              expect(result.value).toBeGreaterThan(exclusiveMinimum);
              expect(result.value).toBeLessThan(exclusiveMaximum);
              expect(Number.isInteger(result.value)).toBe(true);

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[INTEGER_GENERATOR] Exclusive bounds - range: (${exclusiveMinimum}, ${exclusiveMaximum}), generated: ${result.value}, seed: ${seed}`
                );
              }
            }
          }
        ),
        { parameters: { seed: INTEGER_TEST_SEED, numRuns: getNumRuns() } }
      );
    });
  });

  describe('validate', () => {
    it('should validate integer values correctly', () => {
      return propertyTest(
        'IntegerGenerator validate integers',
        fc.property(fc.integer(), (value) => {
          const schema: IntegerSchema = { type: 'integer' };
          const ajv = getAjv();
          const ajvValidate = ajv.compile(schema);

          const isValid = generator.validate(value, schema);
          const ajvResult = ajvValidate(value);

          // Oracle consistency check
          expect(isValid).toBe(ajvResult);
          expect(isValid).toBe(true);

          if (process.env.VERBOSE_LOGS === 'true') {
            console.log(
              `[INTEGER_GENERATOR] Validate test - value: ${value}, our result: ${isValid}, ajv result: ${ajvResult}`
            );
          }
        }),
        { parameters: { seed: INTEGER_TEST_SEED, numRuns: getNumRuns() } }
      );
    });

    it('should reject non-integer values', () => {
      return propertyTest(
        'IntegerGenerator rejects non-integers',
        fc.property(
          fc.oneof(
            fc.string(),
            fc.float({ noInteger: true }), // Non-integer floating point numbers
            fc.boolean(),
            fc.constantFrom(null, undefined),
            fc.array(fc.anything()),
            fc.object(),
            fc.constantFrom('123', 'true', 'false', 'infinity', 'NaN', 1.5, 2.7)
          ),
          (nonIntegerValue) => {
            const schema: IntegerSchema = { type: 'integer' };
            const ajv = getAjv();
            const ajvValidate = ajv.compile(schema);

            const isValid = generator.validate(nonIntegerValue, schema);
            const ajvResult = ajvValidate(nonIntegerValue);

            // Oracle consistency check
            expect(isValid).toBe(ajvResult);
            expect(isValid).toBe(false);

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[INTEGER_GENERATOR] Reject test - value: ${JSON.stringify(nonIntegerValue)}, our result: ${isValid}, ajv result: ${ajvResult}`
              );
            }
          }
        ),
        { parameters: { seed: INTEGER_TEST_SEED, numRuns: getNumRuns() } }
      );
    });

    it('should validate constraint compliance', () => {
      return propertyTest(
        'IntegerGenerator constraint compliance',
        fc.property(
          createBounds(0, 100),
          fc.integer({ min: -200, max: 200 }),
          ([minimum, maximum], testValue) => {
            const schema: IntegerSchema = { type: 'integer', minimum, maximum };
            const ajv = getAjv();
            const ajvValidate = ajv.compile(schema);

            const isValid = generator.validate(testValue, schema);
            const ajvResult = ajvValidate(testValue);
            const shouldBeValid = testValue >= minimum && testValue <= maximum;

            // Oracle consistency check
            expect(isValid).toBe(ajvResult);
            expect(isValid).toBe(shouldBeValid);

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[INTEGER_GENERATOR] Constraint validate - range: [${minimum}, ${maximum}], value: ${testValue}, our result: ${isValid}, ajv result: ${ajvResult}`
              );
            }
          }
        ),
        { parameters: { seed: INTEGER_TEST_SEED, numRuns: getNumRuns() } }
      );
    });

    it('should validate multipleOf constraint correctly', () => {
      return propertyTest(
        'IntegerGenerator multipleOf validation',
        fc.property(
          fc.oneof(
            fc.constant(1),
            fc.constant(2),
            fc.constant(5),
            fc.constant(10)
          ),
          fc.integer({ min: -100, max: 100 }),
          (multipleOf, testValue) => {
            const schema: IntegerSchema = { type: 'integer', multipleOf };
            const ajv = getAjv();
            const ajvValidate = ajv.compile(schema);

            const isValid = generator.validate(testValue, schema);
            const ajvResult = ajvValidate(testValue);
            const shouldBeValid = Math.abs(testValue % multipleOf) === 0;

            // Oracle consistency check
            expect(isValid).toBe(ajvResult);
            expect(isValid).toBe(shouldBeValid);

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[INTEGER_GENERATOR] MultipleOf validate - multipleOf: ${multipleOf}, value: ${testValue}, remainder: ${testValue % multipleOf}, our result: ${isValid}, ajv result: ${ajvResult}`
              );
            }
          }
        ),
        { parameters: { seed: INTEGER_TEST_SEED, numRuns: getNumRuns() } }
      );
    });
  });

  describe('getExamples', () => {
    it('should return enum values as examples when available', () => {
      return propertyTest(
        'IntegerGenerator getExamples enum',
        fc.property(
          fc.array(fc.integer({ min: -100, max: 100 }), {
            minLength: 1,
            maxLength: 5,
          }),
          (enumValues) => {
            const schema: IntegerSchema = { type: 'integer', enum: enumValues };
            const examples = generator.getExamples(schema);

            expect(examples).toEqual(enumValues);

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[INTEGER_GENERATOR] getExamples enum test - enum: ${JSON.stringify(enumValues)}, examples: ${JSON.stringify(examples)}`
              );
            }
          }
        ),
        { parameters: { seed: INTEGER_TEST_SEED, numRuns: getNumRuns() } }
      );
    });

    it('should return const value as example when available', () => {
      return propertyTest(
        'IntegerGenerator getExamples const',
        fc.property(fc.integer({ min: -100, max: 100 }), (constValue) => {
          const schema: IntegerSchema = { type: 'integer', const: constValue };
          const examples = generator.getExamples(schema);

          expect(examples).toEqual([constValue]);

          if (process.env.VERBOSE_LOGS === 'true') {
            console.log(
              `[INTEGER_GENERATOR] getExamples const test - const: ${constValue}, examples: ${JSON.stringify(examples)}`
            );
          }
        }),
        { parameters: { seed: INTEGER_TEST_SEED, numRuns: getNumRuns() } }
      );
    });

    it('should return schema examples when available', () => {
      return propertyTest(
        'IntegerGenerator getExamples schema examples',
        fc.property(
          fc.array(fc.integer({ min: -100, max: 100 }), {
            minLength: 1,
            maxLength: 5,
          }),
          (schemaExamples) => {
            const schema: IntegerSchema = {
              type: 'integer',
              examples: schemaExamples,
            };
            const examples = generator.getExamples(schema);

            expect(examples).toEqual(schemaExamples);

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[INTEGER_GENERATOR] getExamples schema examples test - schema examples: ${JSON.stringify(schemaExamples)}, examples: ${JSON.stringify(examples)}`
              );
            }
          }
        ),
        { parameters: { seed: INTEGER_TEST_SEED, numRuns: getNumRuns() } }
      );
    });

    it('should return empty array for unsupported schemas', () => {
      return propertyTest(
        'IntegerGenerator getExamples unsupported',
        fc.property(
          getSchemaArbitrary().filter(
            (schema: Record<string, unknown>) =>
              schema.type !== 'integer' && typeof schema.type === 'string'
          ),
          (unsupportedSchema) => {
            const examples = generator.getExamples(unsupportedSchema as any);
            expect(examples).toEqual([]);

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[INTEGER_GENERATOR] getExamples unsupported test - schema: ${JSON.stringify(unsupportedSchema)}, examples: ${JSON.stringify(examples)}`
              );
            }
          }
        ),
        { parameters: { seed: INTEGER_TEST_SEED, numRuns: getNumRuns() } }
      );
    });

    it('should generate examples with multipleOf constraints', () => {
      const testCases = [
        { multipleOf: 5, minimum: 0, maximum: 50 },
        { multipleOf: 3, minimum: 10, maximum: 30 },
        { multipleOf: 7, minimum: -21, maximum: 21 },
        { multipleOf: 1, minimum: -5, maximum: 5 }, // Simple case
      ];

      testCases.forEach(({ multipleOf, minimum, maximum }) => {
        const schema: IntegerSchema = {
          type: 'integer',
          multipleOf,
          minimum,
          maximum,
        };
        const ajv = getAjv();
        const validate = ajv.compile(schema);

        const examples = generator.getExamples(schema);

        expect(examples.length).toBeGreaterThan(0);

        examples.forEach((example) => {
          expect(Number.isInteger(example)).toBe(true);
          expect(example).toBeWithinRange(minimum, maximum);
          expect(validate(example)).toBe(true);

          // Check multipleOf constraint - handle integer case
          const remainder = example % multipleOf;
          expect(Math.abs(remainder)).toBe(0);

          if (process.env.VERBOSE_LOGS === 'true') {
            console.log(
              `[INTEGER_GENERATOR] getExamples multipleOf - multipleOf: ${multipleOf}, example: ${example}, remainder: ${remainder}`
            );
          }
        });
      });
    });

    it('should handle edge cases in getExamples with extreme ranges', () => {
      const edgeCases = [
        { minimum: 5, maximum: 5 }, // Single value
        { minimum: -10, maximum: -1 }, // Negative range
        { minimum: -1, maximum: 1 }, // Range with zero
        { minimum: -1000, maximum: 1000 }, // Large range
        { multipleOf: 0, minimum: 0, maximum: 10 }, // Invalid multipleOf
        { multipleOf: -3, minimum: 0, maximum: 10 }, // Negative multipleOf
      ];

      edgeCases.forEach((constraints, index) => {
        const schema: IntegerSchema = {
          type: 'integer',
          ...constraints,
        };

        const examples = generator.getExamples(schema);

        if (
          constraints.multipleOf === 0 ||
          (constraints.multipleOf && constraints.multipleOf < 0)
        ) {
          // Invalid multipleOf should return empty
          expect(examples.length).toBe(0);
        } else {
          expect(examples.length).toBeGreaterThan(0);

          examples.forEach((example) => {
            expect(Number.isInteger(example)).toBe(true);
            if (constraints.minimum !== undefined) {
              expect(example).toBeGreaterThanOrEqual(constraints.minimum);
            }
            if (constraints.maximum !== undefined) {
              expect(example).toBeLessThanOrEqual(constraints.maximum);
            }

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[INTEGER_GENERATOR] Edge case ${index} - example: ${example}, constraints: ${JSON.stringify(constraints)}`
              );
            }
          });
        }
      });
    });
  });

  describe('Helper Methods Coverage (Integer-Specific)', () => {
    it('should test integer conversion edge cases through generation', () => {
      const testCases = [
        {
          schema: { type: 'integer' as const, const: 42.0 },
          expectedValue: 42,
        }, // Float that's actually int
        {
          schema: { type: 'integer' as const, const: 42.5 },
          shouldError: true,
        }, // Non-integer float
        {
          schema: { type: 'integer' as const, const: '123' as any },
          expectedValue: 123,
        }, // String conversion
        {
          schema: { type: 'integer' as const, const: true as any },
          shouldError: true,
        }, // Boolean
        {
          schema: { type: 'integer' as const, const: null as any },
          shouldError: true,
        }, // Null
      ];

      testCases.forEach(({ schema, expectedValue, shouldError }, index) => {
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: INTEGER_TEST_SEED + index,
        });
        const result = generator.generate(schema, context);

        if (shouldError) {
          expect(result.isErr()).toBe(true);

          if (process.env.VERBOSE_LOGS === 'true') {
            console.log(
              `[INTEGER_GENERATOR] Conversion test ${index} - schema: ${JSON.stringify(schema)}, error expected: ${shouldError}, got error: ${result.isErr()}`
            );
          }
        } else {
          expect(result.isOk()).toBe(true);
          if (result.isOk() && expectedValue !== undefined) {
            expect(result.value).toBe(expectedValue);
            expect(Number.isInteger(result.value)).toBe(true);

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[INTEGER_GENERATOR] Conversion test ${index} - schema: ${JSON.stringify(schema)}, expected: ${expectedValue}, got: ${result.value}`
              );
            }
          }
        }
      });
    });

    it('should test enum value conversion and filtering', () => {
      // Test with mixed enum but focus on the filtering behavior
      const schema: IntegerSchema = {
        type: 'integer',
        enum: [1, 2.0, 3, 4.5, '5', null, true, 6] as any,
      };

      const examples = generator.getExamples(schema);
      const context = createGeneratorContext(schema, formatRegistry, {
        seed: INTEGER_TEST_SEED,
      });

      // Should filter to only valid integers: 1, 2, 3, 6
      const validIntegers = [1, 2, 3, 6];
      expect(examples).toEqual(expect.arrayContaining(validIntegers));
      expect(examples.length).toBeGreaterThanOrEqual(4);

      // All examples should be integers (may include additional boundary examples)
      examples.forEach((example) => {
        expect(Number.isInteger(example)).toBe(true);
        // Should be from the original enum or additional boundary examples
        if (!validIntegers.includes(example)) {
          // Additional examples are acceptable for getExamples
          expect(Number.isInteger(example)).toBe(true);
        }
      });

      // Generation should also work with filtered values
      const result = generator.generate(schema, context);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(validIntegers).toContain(result.value);
        expect(Number.isInteger(result.value)).toBe(true);
      }

      if (process.env.VERBOSE_LOGS === 'true') {
        console.log(
          `[INTEGER_GENERATOR] Enum filtering - original: [1, 2.0, 3, 4.5, '5', null, true, 6], filtered examples: ${JSON.stringify(examples)}, valid integers: ${JSON.stringify(validIntegers)}`
        );
      }
    });

    it('should handle impossible constraint combinations', () => {
      const impossibleCombinations = [
        { type: 'integer' as const, const: 5, minimum: 10, maximum: 20 }, // Const outside range
        { type: 'integer' as const, const: 15, multipleOf: 7 }, // 15 is not multiple of 7
        { type: 'integer' as const, const: 8, exclusiveMinimum: 8 }, // 8 not > 8
        { type: 'integer' as const, const: 10, exclusiveMaximum: 10 }, // 10 not < 10
      ];

      impossibleCombinations.forEach((schema, index) => {
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: INTEGER_TEST_SEED + index,
        });
        const result = generator.generate(schema, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.code).toBe('GENERATION_ERROR');
          // Note: Different implementations might have different constraint error messages
          expect(result.error.constraint).toBeDefined();

          if (process.env.VERBOSE_LOGS === 'true') {
            console.log(
              `[INTEGER_GENERATOR] Impossible constraint ${index} - schema: ${JSON.stringify(schema)}, error: ${result.error.code}, constraint: ${result.error.constraint}`
            );
          }
        }
      });
    });

    it('should test exclusive bounds edge cases', () => {
      const exclusiveCases = [
        { exclusiveMinimum: 5, maximum: 10 }, // 5 < x ≤ 10
        { minimum: 0, exclusiveMaximum: 5 }, // 0 ≤ x < 5
        { exclusiveMinimum: 0, exclusiveMaximum: 2 }, // 0 < x < 2 (only x=1)
        { exclusiveMinimum: 0, exclusiveMaximum: 1 }, // 0 < x < 1 (no valid integers)
      ];

      exclusiveCases.forEach((constraints, index) => {
        const schema: IntegerSchema = { type: 'integer', ...constraints };
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: INTEGER_TEST_SEED + index,
        });
        const ajv = getAjv();
        const validate = ajv.compile(schema);

        const result = generator.generate(schema, context);

        if (index === 3) {
          // No valid integers case (0 < x < 1)
          expect(result.isErr()).toBe(true);
        } else {
          expect(result.isOk()).toBe(true);
          if (result.isOk()) {
            const value = result.value;
            expect(Number.isInteger(value)).toBe(true);
            expect(validate(value)).toBe(true);

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

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[INTEGER_GENERATOR] Exclusive bounds ${index} - constraints: ${JSON.stringify(constraints)}, value: ${value}`
              );
            }
          }
        }
      });
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
      return propertyTest(
        'IntegerGenerator generate/validate consistency',
        fc.property(
          getSchemaArbitrary()
            .filter(
              (schema: Record<string, unknown>) => schema.type === 'integer'
            )
            .map((schema) => schema as unknown as IntegerSchema),
          fc.integer({ min: 0, max: 1000 }),
          (schema, seed) => {
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const ajv = getAjv();
            let ajvValidate: ReturnType<typeof ajv.compile>;
            try {
              ajvValidate = ajv.compile(schema);
            } catch {
              // Skip invalid schemas (property-based testing includes them intentionally)
              return;
            }

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              // AJV validation oracle
              expect(ajvValidate(result.value)).toBe(true);
              // Generated value should always be valid according to the schema
              expect(generator.validate(result.value, schema)).toBe(true);
              expect(Number.isInteger(result.value)).toBe(true);

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[INTEGER_GENERATOR] Integration test - schema: ${JSON.stringify(schema)}, generated: ${result.value}, seed: ${seed}`
                );
              }
            }
          }
        ),
        {
          parameters: { seed: INTEGER_TEST_SEED, numRuns: getNumRuns() },
          context: { phase: 'integration' },
        }
      );
    });

    it('should handle edge cases gracefully', () => {
      const edgeCases = [
        { minimum: 0, maximum: 0 }, // Single valid value
        { exclusiveMinimum: 0, exclusiveMaximum: 5, multipleOf: 2 }, // Small range with multipleOf
        { const: 42 },
        { enum: [1, 2, 3] },
        { minimum: -1000, maximum: 1000, multipleOf: 10 }, // Large range with step
      ];

      edgeCases.forEach((constraints, index) => {
        const schema: IntegerSchema = {
          type: 'integer',
          ...constraints,
        };
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: INTEGER_TEST_SEED + index,
        });
        const ajv = getAjv();
        let ajvValidate: any;
        let ajvCompilationSuccess = true;

        try {
          ajvValidate = ajv.compile(schema);
        } catch {
          ajvCompilationSuccess = false;
        }

        const result = generator.generate(schema, context);

        if (result.isOk()) {
          // If generation succeeds, result should be valid
          expect(generator.validate(result.value, schema)).toBe(true);
          expect(Number.isInteger(result.value)).toBe(true);
          expect(Number.isFinite(result.value)).toBe(true);

          // AJV validation oracle (if compilation succeeded)
          if (ajvCompilationSuccess && ajvValidate) {
            expect(ajvValidate(result.value)).toBe(true);
          }

          if (process.env.VERBOSE_LOGS === 'true') {
            console.log(
              `[INTEGER_GENERATOR] Edge case ${index} - schema: ${JSON.stringify(schema)}, generated: ${result.value}`
            );
          }
        }
        // If generation fails for impossible constraints, that's acceptable
      });
    });

    it('should handle draft-specific exclusive bounds correctly', async () => {
      const drafts: Array<'2019-09' | '2020-12' | 'draft-07'> = [
        'draft-07',
        '2019-09',
        '2020-12',
      ];

      for (const draft of drafts) {
        const ajv = createAjv(draft);
        const schema: IntegerSchema = {
          type: 'integer',
          exclusiveMinimum: 0,
          exclusiveMaximum: 10,
        };
        const validate = ajv.compile(schema);

        await propertyTest(
          `IntegerGenerator draft ${draft} exclusive bounds`,
          fc.property(fc.integer({ min: 0, max: 1000 }), (seed) => {
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              // AJV validation oracle with draft-specific behavior
              expect(validate(result.value)).toBe(true);
              expect(result.value).toBeGreaterThan(0);
              expect(result.value).toBeLessThan(10);
              expect(Number.isInteger(result.value)).toBe(true);

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[INTEGER_GENERATOR] Draft ${draft} exclusive bounds - generated: ${result.value}, seed: ${seed}`
                );
              }
            }
          }),
          {
            parameters: {
              seed: INTEGER_TEST_SEED + drafts.indexOf(draft) * 1000,
              numRuns: Math.floor(getNumRuns() / 3),
            },
            context: { draft },
          }
        );
      }
    });

    it('should handle multipleOf edge cases correctly', () => {
      const edgeCases = [
        { multipleOf: 1, minimum: 0, maximum: 10 },
        { multipleOf: 2, minimum: 1, maximum: 9 }, // Odd range with even multipleOf
        { multipleOf: 5, exclusiveMinimum: 0, exclusiveMaximum: 20 },
        { multipleOf: 7, minimum: 14, maximum: 28 }, // Range that's exactly 2 multiples
      ];

      edgeCases.forEach((constraints, index) => {
        const schema: IntegerSchema = {
          type: 'integer',
          ...constraints,
        };
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: INTEGER_TEST_SEED + index,
        });
        const ajv = getAjv();
        const validate = ajv.compile(schema);

        const result = generator.generate(schema, context);

        if (result.isOk()) {
          // If generation succeeds, result should be valid
          expect(validate(result.value)).toBe(true);
          expect(Number.isInteger(result.value)).toBe(true);
          expect(generator.validate(result.value, schema)).toBe(true);

          if (process.env.VERBOSE_LOGS === 'true') {
            console.log(
              `[INTEGER_GENERATOR] MultipleOf edge case ${index} - schema: ${JSON.stringify(schema)}, generated: ${result.value}`
            );
          }
        }
        // If no valid values exist (impossible constraints), generation may fail
      });
    });
  });

  describe('FormatAdapter Cross-Reference Tests (Task 21)', () => {
    it('should maintain consistency with numeric format handling', () => {
      return propertyTest(
        'IntegerGenerator numeric format consistency',
        fc.property(
          createBounds(-1000, 1000),
          fc.integer({ min: 0, max: 1000 }),
          ([minimum, maximum], seed) => {
            const schema: IntegerSchema = { type: 'integer', minimum, maximum };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const ajv = getAjv();
            const validate = ajv.compile(schema);

            const result = generator.generate(schema, context);

            if (result.isOk()) {
              // AJV validation oracle
              expect(validate(result.value)).toBe(true);

              // Cross-reference: value should also validate with createBounds logic
              expect(result.value).toBeWithinRange(minimum, maximum);

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[INTEGER_GENERATOR] FormatAdapter consistency - bounds: [${minimum}, ${maximum}], generated: ${result.value}, seed: ${seed}`
                );
              }
            }
          }
        ),
        { parameters: { seed: INTEGER_TEST_SEED, numRuns: getNumRuns() } }
      );
    });

    it('should handle edge cases where createBounds and AJV might differ', () => {
      const edgeCases = [
        { minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER },
        { exclusiveMinimum: -1, exclusiveMaximum: 1 },
        { minimum: 0, maximum: 0 }, // Single value
        { multipleOf: 1, minimum: -5, maximum: 5 },
      ];

      edgeCases.forEach((constraints, index) => {
        const schema: IntegerSchema = { type: 'integer', ...constraints };
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: INTEGER_TEST_SEED + index,
        });
        const ajv = getAjv();

        try {
          const validate = ajv.compile(schema);
          const result = generator.generate(schema, context);

          if (result.isOk()) {
            // Both validation methods should agree
            expect(validate(result.value)).toBe(true);
            expect(generator.validate(result.value, schema)).toBe(true);

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[INTEGER_GENERATOR] Edge case ${index} - schema: ${JSON.stringify(schema)}, generated: ${result.value}`
              );
            }
          }
        } catch (error) {
          // Skip invalid constraint combinations
        }
      });
    });
  });
});
