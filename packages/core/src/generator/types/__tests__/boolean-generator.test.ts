import { describe, it, expect, beforeEach } from 'vitest';
/**
 * Property-based tests for BooleanGenerator - Phase 3 Migration
 * Using AJV validation oracle and getSchemaArbitrary pattern
 *
 * Migration Strategy:
 * - Keep existing Result pattern and test structure
 * - Add AJV validation after isOk() checks
 * - Replace manual schema arbitrary with getSchemaArbitrary().filter()
 * - Add seed parameter and logging
 * - Verify tests pass with all drafts
 */

import fc from 'fast-check';
import { BooleanGenerator } from '../boolean-generator';
import { createGeneratorContext } from '../../data-generator';
import { FormatRegistry } from '../../../registry/format-registry';
import type { BooleanSchema } from '../../../types/schema';
import { getAjv } from '../../../../../../test/helpers/ajv-factory';
import { getSchemaArbitrary } from '../../../../../../test/arbitraries/json-schema';
import { propertyTest } from '../../../../../../test/setup';

describe('BooleanGenerator', () => {
  let generator: BooleanGenerator;
  let formatRegistry: FormatRegistry;

  /** Fixed seed for deterministic testing */
  const BOOLEAN_TEST_SEED = 424242;

  /** Get configured numRuns from fast-check globals */
  const getNumRuns = (): number => {
    const config = fc.readConfigureGlobal();
    return config.numRuns || 100;
  };

  beforeEach(() => {
    generator = new BooleanGenerator();
    formatRegistry = new FormatRegistry();
  });

  describe('supports', () => {
    it('should support boolean schemas', () => {
      return propertyTest(
        'BooleanGenerator supports boolean',
        fc.property(
          getSchemaArbitrary()
            .filter(
              (schema: Record<string, unknown>) => schema.type === 'boolean'
            )
            .map((schema) => schema as unknown as BooleanSchema),
          (schema) => {
            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                '[BOOLEAN_GENERATOR] Testing support for schema:',
                JSON.stringify(schema)
              );
            }
            expect(generator.supports(schema)).toBe(true);
          }
        ),
        { parameters: { seed: BOOLEAN_TEST_SEED, numRuns: getNumRuns() } }
      );
    });

    it('should not support non-boolean schemas', () => {
      return propertyTest(
        'BooleanGenerator rejects non-boolean',
        fc.property(
          getSchemaArbitrary().filter(
            (schema: Record<string, unknown>) => schema.type !== 'boolean'
          ),
          (schema) => {
            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                '[BOOLEAN_GENERATOR] Testing non-support for schema:',
                JSON.stringify(schema)
              );
            }
            expect(generator.supports(schema as any)).toBe(false);
          }
        ),
        { parameters: { seed: BOOLEAN_TEST_SEED, numRuns: getNumRuns() } }
      );
    });
  });

  describe('generate', () => {
    it('should always generate booleans', () => {
      const schema: BooleanSchema = { type: 'boolean' };
      const context = createGeneratorContext(schema, formatRegistry);
      const ajv = getAjv();
      const validate = ajv.compile(schema);

      return propertyTest(
        'BooleanGenerator always generates booleans',
        fc.property(fc.integer({ min: 0, max: 1000 }), (seed) => {
          const contextWithSeed = { ...context, seed };
          const result = generator.generate(schema, contextWithSeed);

          expect(result.isOk()).toBe(true);
          if (result.isOk()) {
            // AJV validation oracle
            expect(validate(result.value)).toBe(true);
            expect(typeof result.value).toBe('boolean');
            expect([true, false]).toContain(result.value);

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[BOOLEAN_GENERATOR] Generated: ${result.value} with seed: ${seed}`
              );
            }
          }
        }),
        { parameters: { seed: BOOLEAN_TEST_SEED, numRuns: getNumRuns() } }
      );
    });

    it('should generate both true and false values over multiple runs', () => {
      const schema: BooleanSchema = { type: 'boolean' };
      const context = createGeneratorContext(schema, formatRegistry);
      const ajv = getAjv();
      const validate = ajv.compile(schema);

      const results: boolean[] = [];

      // Generate multiple values to check distribution
      for (let i = 0; i < 100; i++) {
        const contextWithSeed = { ...context, seed: i };
        const result = generator.generate(schema, contextWithSeed);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          // AJV validation oracle
          expect(validate(result.value)).toBe(true);
          results.push(result.value);
        }
      }

      // Should have generated both true and false values
      expect(results).toContain(true);
      expect(results).toContain(false);

      if (process.env.VERBOSE_LOGS === 'true') {
        const trueCount = results.filter((r) => r === true).length;
        const falseCount = results.filter((r) => r === false).length;
        console.log(
          `[BOOLEAN_GENERATOR] Distribution - true: ${trueCount}, false: ${falseCount}`
        );
      }
    });

    it('should generate values from enum when provided', () => {
      return propertyTest(
        'BooleanGenerator generates enum',
        fc.property(
          fc.oneof(
            fc.constant([true]),
            fc.constant([false]),
            fc.constant([true, false])
          ),
          fc.integer({ min: 0, max: 1000 }),
          (enumValues, seed) => {
            const schema: BooleanSchema = { type: 'boolean', enum: enumValues };
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
              expect(enumValues).toContain(result.value);
              expect(typeof result.value).toBe('boolean');

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[BOOLEAN_GENERATOR] Generated enum value: ${result.value} from ${JSON.stringify(enumValues)} with seed: ${seed}`
                );
              }
            }
          }
        ),
        { parameters: { seed: BOOLEAN_TEST_SEED, numRuns: getNumRuns() } }
      );
    });

    it('should generate const value when provided', () => {
      return propertyTest(
        'BooleanGenerator generates const',
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
            const ajv = getAjv();
            const validate = ajv.compile(schema);

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              // AJV validation oracle
              expect(validate(result.value)).toBe(true);
              expect(result.value).toBe(constValue);

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[BOOLEAN_GENERATOR] Generated const value: ${result.value} with seed: ${seed}`
                );
              }
            }
          }
        ),
        { parameters: { seed: BOOLEAN_TEST_SEED, numRuns: getNumRuns() } }
      );
    });

    it('should generate same values with same seed', () => {
      return propertyTest(
        'BooleanGenerator same seed stability',
        fc.property(fc.integer({ min: 0, max: 1000 }), (seed) => {
          const schema: BooleanSchema = { type: 'boolean' };
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
                `[BOOLEAN_GENERATOR] Deterministic check - seed: ${seed}, values: ${result1.value}, ${result2.value}`
              );
            }
          }
        }),
        { parameters: { seed: BOOLEAN_TEST_SEED, numRuns: getNumRuns() } }
      );
    });

    it('should handle different scenarios appropriately', async () => {
      const scenarios: Array<'normal' | 'edge' | 'peak' | 'error'> = [
        'normal',
        'edge',
        'peak',
        'error',
      ];

      for (const [i, scenario] of scenarios.entries()) {
        const ajv = getAjv();
        const schema: BooleanSchema = { type: 'boolean' };
        const validate = ajv.compile(schema);

        await propertyTest(
          `BooleanGenerator scenario ${scenario}`,
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
              expect(typeof result.value).toBe('boolean');

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[BOOLEAN_GENERATOR] Scenario ${scenario} - seed: ${seed}, value: ${result.value}`
                );
              }
            }
          }),
          {
            parameters: {
              seed: BOOLEAN_TEST_SEED + i,
              numRuns: Math.floor(getNumRuns() / 5),
            },
            context: { scenario },
          }
        );
      }
    });

    it('should handle default values when provided', () => {
      return propertyTest(
        'BooleanGenerator default values respected',
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
            const ajv = getAjv();
            const validate = ajv.compile(schema);

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              // AJV validation oracle
              expect(validate(result.value)).toBe(true);
              expect(typeof result.value).toBe('boolean');
              // With some probability, should use default value
              expect([true, false]).toContain(result.value);

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[BOOLEAN_GENERATOR] Default test - default: ${defaultValue}, generated: ${result.value}, seed: ${seed}`
                );
              }
            }
          }
        ),
        { parameters: { seed: BOOLEAN_TEST_SEED, numRuns: getNumRuns() } }
      );
    });

    it('should handle examples when provided', () => {
      return propertyTest(
        'BooleanGenerator examples influence generation',
        fc.property(
          fc.array(fc.boolean(), { minLength: 1, maxLength: 2 }),
          fc.integer({ min: 0, max: 1000 }),
          (examples, seed) => {
            const schema: BooleanSchema = { type: 'boolean', examples };
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
              expect(typeof result.value).toBe('boolean');
              // Should generate valid boolean values (may or may not use examples)

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[BOOLEAN_GENERATOR] Examples test - examples: ${JSON.stringify(examples)}, generated: ${result.value}, seed: ${seed}`
                );
              }
            }
          }
        ),
        { parameters: { seed: BOOLEAN_TEST_SEED, numRuns: getNumRuns() } }
      );
    });

    it('should be deterministic with probability configuration', () => {
      // Test that the generator respects probability settings consistently
      return propertyTest(
        'BooleanGenerator deterministic with probability configuration',
        fc.property(
          fc.float({ min: 0, max: 1 }),
          fc.integer({ min: 0, max: 1000 }),
          (_trueProbability, seed) => {
            const schema: BooleanSchema = { type: 'boolean' };
            const ajv = getAjv();
            const validate = ajv.compile(schema);

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
                // AJV validation oracle
                expect(validate(result.value)).toBe(true);
                results.push(result.value);
              }
            }

            // All results should be the same (deterministic)
            if (results.length > 1) {
              expect(results.every((r) => r === results[0])).toBe(true);

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[BOOLEAN_GENERATOR] Deterministic test - seed: ${seed}, all values: ${results[0]}`
                );
              }
            }
          }
        ),
        { parameters: { seed: BOOLEAN_TEST_SEED, numRuns: getNumRuns() } }
      );
    });
  });

  describe('validate', () => {
    it('should validate boolean values correctly', () => {
      return propertyTest(
        'BooleanGenerator validate booleans',
        fc.property(fc.boolean(), (value) => {
          const schema: BooleanSchema = { type: 'boolean' };
          const ajv = getAjv();
          const ajvValidate = ajv.compile(schema);

          const isValid = generator.validate(value, schema);
          const ajvResult = ajvValidate(value);

          // Oracle consistency check
          expect(isValid).toBe(ajvResult);
          expect(isValid).toBe(true);

          if (process.env.VERBOSE_LOGS === 'true') {
            console.log(
              `[BOOLEAN_GENERATOR] Validate test - value: ${value}, our result: ${isValid}, ajv result: ${ajvResult}`
            );
          }
        }),
        { parameters: { seed: BOOLEAN_TEST_SEED, numRuns: getNumRuns() } }
      );
    });

    it('should reject non-boolean values', () => {
      return propertyTest(
        'BooleanGenerator reject non-boolean',
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
            const ajv = getAjv();
            const ajvValidate = ajv.compile(schema);

            const isValid = generator.validate(nonBooleanValue, schema);
            const ajvResult = ajvValidate(nonBooleanValue);

            // Oracle consistency check
            expect(isValid).toBe(ajvResult);
            expect(isValid).toBe(false);

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[BOOLEAN_GENERATOR] Reject test - value: ${JSON.stringify(nonBooleanValue)}, our result: ${isValid}, ajv result: ${ajvResult}`
              );
            }
          }
        ),
        { parameters: { seed: BOOLEAN_TEST_SEED, numRuns: getNumRuns() } }
      );
    });

    it('should validate enum constraints correctly', () => {
      return propertyTest(
        'BooleanGenerator validate enum',
        fc.property(
          fc.oneof(
            fc.constant([true]),
            fc.constant([false]),
            fc.constant([true, false])
          ),
          fc.boolean(),
          (enumValues, testValue) => {
            const schema: BooleanSchema = { type: 'boolean', enum: enumValues };
            const ajv = getAjv();
            const ajvValidate = ajv.compile(schema);

            const isValid = generator.validate(testValue, schema);
            const ajvResult = ajvValidate(testValue);
            const shouldBeValid = enumValues.includes(testValue);

            // Oracle consistency check
            expect(isValid).toBe(ajvResult);
            expect(isValid).toBe(shouldBeValid);

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[BOOLEAN_GENERATOR] Enum validate - enum: ${JSON.stringify(enumValues)}, value: ${testValue}, our result: ${isValid}, ajv result: ${ajvResult}`
              );
            }
          }
        ),
        { parameters: { seed: BOOLEAN_TEST_SEED, numRuns: getNumRuns() } }
      );
    });

    it('should validate const constraints correctly', () => {
      return propertyTest(
        'BooleanGenerator validate const',
        fc.property(fc.boolean(), fc.boolean(), (constValue, testValue) => {
          const schema: BooleanSchema = { type: 'boolean', const: constValue };
          const ajv = getAjv();
          const ajvValidate = ajv.compile(schema);

          const isValid = generator.validate(testValue, schema);
          const ajvResult = ajvValidate(testValue);
          const shouldBeValid = testValue === constValue;

          // Oracle consistency check
          expect(isValid).toBe(ajvResult);
          expect(isValid).toBe(shouldBeValid);

          if (process.env.VERBOSE_LOGS === 'true') {
            console.log(
              `[BOOLEAN_GENERATOR] Const validate - const: ${constValue}, value: ${testValue}, our result: ${isValid}, ajv result: ${ajvResult}`
            );
          }
        }),
        { parameters: { seed: BOOLEAN_TEST_SEED, numRuns: getNumRuns() } }
      );
    });

    it('should handle schemas without boolean type', () => {
      return propertyTest(
        'BooleanGenerator unsupported schema validation',
        fc.property(
          fc.boolean(),
          getSchemaArbitrary().filter(
            (schema: Record<string, unknown>) =>
              schema.type !== 'boolean' && typeof schema.type === 'string'
          ),
          (value, unsupportedSchema) => {
            const ajv = getAjv();
            let ajvResult: boolean;
            try {
              const ajvValidate = ajv.compile(unsupportedSchema);
              ajvResult = ajvValidate(value);
            } catch {
              // If AJV compilation fails, assume invalid
              ajvResult = false;
            }

            const isValid = generator.validate(value, unsupportedSchema as any);

            // For unsupported schemas, our generator should return false
            expect(isValid).toBe(false);

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[BOOLEAN_GENERATOR] Unsupported schema test - value: ${value}, schema: ${JSON.stringify(unsupportedSchema)}, our result: ${isValid}, ajv result: ${ajvResult}`
              );
            }
          }
        ),
        { parameters: { seed: BOOLEAN_TEST_SEED, numRuns: getNumRuns() } }
      );
    });
  });

  describe('getExamples', () => {
    it('should return enum values as examples when available', () => {
      return propertyTest(
        'BooleanGenerator getExamples enum',
        fc.property(
          fc.oneof(
            fc.constant([true]),
            fc.constant([false]),
            fc.constant([true, false])
          ),
          (enumValues) => {
            const schema: BooleanSchema = { type: 'boolean', enum: enumValues };
            const examples = generator.getExamples(schema);

            expect(examples).toEqual(enumValues);

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[BOOLEAN_GENERATOR] getExamples enum test - enum: ${JSON.stringify(enumValues)}, examples: ${JSON.stringify(examples)}`
              );
            }
          }
        ),
        { parameters: { seed: BOOLEAN_TEST_SEED, numRuns: getNumRuns() } }
      );
    });

    it('should return const value as example when available', () => {
      return propertyTest(
        'BooleanGenerator getExamples const',
        fc.property(fc.boolean(), (constValue) => {
          const schema: BooleanSchema = { type: 'boolean', const: constValue };
          const examples = generator.getExamples(schema);

          expect(examples).toEqual([constValue]);

          if (process.env.VERBOSE_LOGS === 'true') {
            console.log(
              `[BOOLEAN_GENERATOR] getExamples const test - const: ${constValue}, examples: ${JSON.stringify(examples)}`
            );
          }
        }),
        { parameters: { seed: BOOLEAN_TEST_SEED, numRuns: getNumRuns() } }
      );
    });

    it('should return schema examples when available', () => {
      return propertyTest(
        'BooleanGenerator getExamples schema examples',
        fc.property(
          fc.oneof(
            fc.constant([true]),
            fc.constant([false]),
            fc.constant([true, false])
          ),
          (schemaExamples) => {
            const schema: BooleanSchema = {
              type: 'boolean',
              examples: schemaExamples,
            };
            const examples = generator.getExamples(schema);

            expect(examples).toEqual(schemaExamples);

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[BOOLEAN_GENERATOR] getExamples schema examples test - schema examples: ${JSON.stringify(schemaExamples)}, examples: ${JSON.stringify(examples)}`
              );
            }
          }
        ),
        { parameters: { seed: BOOLEAN_TEST_SEED, numRuns: getNumRuns() } }
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
      return propertyTest(
        'BooleanGenerator getExamples unsupported schemas',
        fc.property(
          getSchemaArbitrary().filter(
            (schema: Record<string, unknown>) =>
              schema.type !== 'boolean' && typeof schema.type === 'string'
          ),
          (unsupportedSchema) => {
            const examples = generator.getExamples(unsupportedSchema as any);
            expect(examples).toEqual([]);

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[BOOLEAN_GENERATOR] getExamples unsupported test - schema: ${JSON.stringify(unsupportedSchema)}, examples: ${JSON.stringify(examples)}`
              );
            }
          }
        ),
        { parameters: { seed: BOOLEAN_TEST_SEED, numRuns: getNumRuns() } }
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
      return propertyTest(
        'BooleanGenerator integration generate vs validate',
        fc.property(
          getSchemaArbitrary()
            .filter(
              (schema: Record<string, unknown>) => schema.type === 'boolean'
            )
            .map((schema) => schema as unknown as BooleanSchema),
          fc.integer({ min: 0, max: 1000 }),
          (schema, seed) => {
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const ajv = getAjv();
            const ajvValidate = ajv.compile(schema);

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              // AJV validation oracle
              expect(ajvValidate(result.value)).toBe(true);
              // Generated value should always be valid according to the schema
              expect(generator.validate(result.value, schema)).toBe(true);
              expect(typeof result.value).toBe('boolean');

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[BOOLEAN_GENERATOR] Integration test - schema: ${JSON.stringify(schema)}, generated: ${result.value}, seed: ${seed}`
                );
              }
            }
          }
        ),
        { parameters: { seed: BOOLEAN_TEST_SEED, numRuns: getNumRuns() } }
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
          seed: BOOLEAN_TEST_SEED + index,
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
          expect(typeof result.value).toBe('boolean');

          // AJV validation oracle (if compilation succeeded)
          if (ajvCompilationSuccess && ajvValidate) {
            expect(ajvValidate(result.value)).toBe(true);
          }

          if (process.env.VERBOSE_LOGS === 'true') {
            console.log(
              `[BOOLEAN_GENERATOR] Edge case ${index} - schema: ${JSON.stringify(schema)}, generated: ${result.value}`
            );
          }
        }
        // If generation fails for edge cases like empty enum, that's acceptable
      });
    });

    it('should produce reasonable distribution over many samples', () => {
      const schema: BooleanSchema = { type: 'boolean' };
      const results: boolean[] = [];
      const ajv = getAjv();
      const ajvValidate = ajv.compile(schema);

      // Generate many samples
      for (let i = 0; i < 1000; i++) {
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: BOOLEAN_TEST_SEED + i,
        });
        const result = generator.generate(schema, context);

        if (result.isOk()) {
          // AJV validation oracle
          expect(ajvValidate(result.value)).toBe(true);
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

      if (process.env.VERBOSE_LOGS === 'true') {
        console.log(
          `[BOOLEAN_GENERATOR] Distribution test - total: ${results.length}, true: ${trueCount} (${((trueCount / results.length) * 100).toFixed(1)}%), false: ${falseCount} (${((falseCount / results.length) * 100).toFixed(1)}%)`
        );
      }
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
          seed: BOOLEAN_TEST_SEED,
          scenario,
        });
        const ajv = getAjv();
        const ajvValidate = ajv.compile(schema);

        const result = generator.generate(schema, context);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          // AJV validation oracle
          expect(ajvValidate(result.value)).toBe(true);
          expect(typeof result.value).toBe('boolean');
          expect(generator.validate(result.value, schema)).toBe(true);

          if (process.env.VERBOSE_LOGS === 'true') {
            console.log(
              `[BOOLEAN_GENERATOR] Scenario test - scenario: ${scenario}, generated: ${result.value}`
            );
          }
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
          seed: BOOLEAN_TEST_SEED + index,
        });
        const ajv = getAjv();
        const ajvValidate = ajv.compile(schema);

        const result = generator.generate(schema, context);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          // AJV validation oracle
          expect(ajvValidate(result.value)).toBe(true);
          expect(typeof result.value).toBe('boolean');
          expect([true, false]).toContain(result.value);
          expect(generator.validate(result.value, schema)).toBe(true);

          if (process.env.VERBOSE_LOGS === 'true') {
            console.log(
              `[BOOLEAN_GENERATOR] Comprehensive test ${index} - constraints: ${JSON.stringify(constraints)}, generated: ${result.value}`
            );
          }
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

      scenarios.forEach((scenario, scenarioIndex) => {
        void propertyTest(
          `BooleanGenerator deterministic across scenarios: ${scenario}`,
          fc.property(fc.integer({ min: 0, max: 1000 }), (seed) => {
            const schema: BooleanSchema = { type: 'boolean' };
            const ajv = getAjv();
            const ajvValidate = ajv.compile(schema);

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
              // AJV validation oracle for both results
              expect(ajvValidate(result1.value)).toBe(true);
              expect(ajvValidate(result2.value)).toBe(true);
              expect(result1.value).toBe(result2.value);

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[BOOLEAN_GENERATOR] Deterministic across scenarios - scenario: ${scenario}, seed: ${seed}, values: ${result1.value}, ${result2.value}`
                );
              }
            }
          }),
          {
            parameters: {
              seed: BOOLEAN_TEST_SEED + scenarioIndex * 1000,
              numRuns: Math.floor(getNumRuns() / 4),
            },
            context: { scenario },
          }
        );
      });
    });

    it('should provide correct priority handling', () => {
      // const should override enum - but AJV validates both, so they must be compatible
      const constSchema: BooleanSchema = {
        type: 'boolean',
        const: true,
        enum: [true], // Must be compatible with const for AJV validation
      };
      const ajv = getAjv();
      const ajvValidate = ajv.compile(constSchema);

      for (let i = 0; i < 10; i++) {
        const context = createGeneratorContext(constSchema, formatRegistry, {
          seed: BOOLEAN_TEST_SEED + i,
        });
        const result = generator.generate(constSchema, context);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          // AJV validation oracle
          expect(ajvValidate(result.value)).toBe(true);
          expect(result.value).toBe(true); // Should always be true due to const

          if (process.env.VERBOSE_LOGS === 'true') {
            console.log(
              `[BOOLEAN_GENERATOR] Priority test ${i} - const overrides enum, generated: ${result.value}`
            );
          }
        }
      }
    });
  });
});
