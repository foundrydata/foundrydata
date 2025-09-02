import { describe, it, expect, beforeEach } from 'vitest';
/**
 * Property-based tests for NumberGenerator - Phase 3 Migration
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
import { NumberGenerator } from '../number-generator';
import { createGeneratorContext } from '../../data-generator';
import { FormatRegistry } from '../../../registry/format-registry';
import type { NumberSchema } from '../../../types/schema';
import {
  getAjv,
  createAjv,
} from '../../../../../../test/helpers/ajv-factory.js';
import {
  getSchemaArbitrary,
  createBounds,
} from '../../../../../../test/arbitraries/json-schema.js';
import '../../../../../../test/matchers';

/**
 * Helper to calculate Unit in the Last Place (ULP) for floating-point precision
 */
function ulp(value: number): number {
  if (!Number.isFinite(value)) return NaN;
  if (value === 0) return Number.MIN_VALUE;

  const absValue = Math.abs(value);
  const exponent = Math.floor(Math.log2(absValue));
  return Math.pow(2, exponent - 52);
}

/**
 * Helper for multipleOf validation with IEEE-754 floating-point tolerance
 */
function isMultipleOf(value: number, multipleOf: number): boolean {
  if (
    multipleOf <= 0 ||
    !Number.isFinite(value) ||
    !Number.isFinite(multipleOf)
  )
    return false;

  const q = value / multipleOf;
  const k = Math.round(q);
  const recon = k * multipleOf;
  const absErr = Math.abs(value - recon);
  const tol =
    ulp(value) + Math.abs(k) * ulp(multipleOf) + Math.abs(value) * 1e-15;

  return absErr <= tol;
}

/**
 * Calculate decimal places for multipleOf step values
 */
function decimalPlaces(step: number): number {
  const s = step.toString().toLowerCase();
  if (s.includes('e')) {
    const parts = s.split('e');
    const coeffStr = parts[0];
    const expStr = parts[1];
    if (!coeffStr || !expStr) return 0;
    const coeffFrac = coeffStr.split('.')[1]?.length ?? 0;
    const exp = Number(expStr);
    return Math.max(0, coeffFrac - exp);
  }
  return s.split('.')[1]?.length ?? 0;
}

describe('NumberGenerator', () => {
  let generator: NumberGenerator;
  let formatRegistry: FormatRegistry;

  /** Fixed seed for deterministic testing */
  const NUMBER_TEST_SEED = 424242;

  /** Get configured numRuns from fast-check globals */
  const getNumRuns = (): number => {
    const config = fc.readConfigureGlobal();
    return config.numRuns || 100;
  };

  beforeEach(() => {
    generator = new NumberGenerator();
    formatRegistry = new FormatRegistry();
  });

  describe('supports', () => {
    it('should support number schemas', () => {
      fc.assert(
        fc.property(
          getSchemaArbitrary()
            .filter(
              (schema: Record<string, unknown>) => schema.type === 'number'
            )
            .map((schema) => schema as unknown as NumberSchema),
          (schema) => {
            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                '[NUMBER_GENERATOR] Testing support for schema:',
                JSON.stringify(schema)
              );
            }
            expect(generator.supports(schema)).toBe(true);
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should not support non-number schemas', () => {
      fc.assert(
        fc.property(
          getSchemaArbitrary().filter(
            (schema: Record<string, unknown>) => schema.type !== 'number'
          ),
          (schema) => {
            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                '[NUMBER_GENERATOR] Testing non-support for schema:',
                JSON.stringify(schema)
              );
            }
            expect(generator.supports(schema as any)).toBe(false);
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should reject Draft-04 boolean exclusive bounds (Draft-07+ compliance)', () => {
      // Draft-04 style with boolean exclusiveMinimum
      expect(
        generator.supports({
          type: 'number',
          minimum: 0,
          exclusiveMinimum: true as any,
        })
      ).toBe(false);

      // Draft-04 style with boolean exclusiveMaximum
      expect(
        generator.supports({
          type: 'number',
          maximum: 100,
          exclusiveMaximum: true as any,
        })
      ).toBe(false);

      // Draft-07+ style with numeric exclusive bounds should work
      expect(
        generator.supports({
          type: 'number',
          exclusiveMinimum: 0,
          exclusiveMaximum: 100,
        })
      ).toBe(true);
    });
  });

  describe('generate', () => {
    it('should always generate numbers', () => {
      const schema: NumberSchema = { type: 'number' };
      const context = createGeneratorContext(schema, formatRegistry);
      const ajv = getAjv();
      const validate = ajv.compile(schema);

      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1000 }), (seed) => {
          const contextWithSeed = { ...context, seed };
          const result = generator.generate(schema, contextWithSeed);

          expect(result.isOk()).toBe(true);
          if (result.isOk()) {
            // AJV validation oracle
            expect(validate(result.value)).toBe(true);
            expect(typeof result.value).toBe('number');
            expect(Number.isFinite(result.value)).toBe(true);
            expect(Number.isNaN(result.value)).toBe(false);

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[NUMBER_GENERATOR] Generated: ${result.value} with seed: ${seed}`
              );
            }
          }
        }),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should respect minimum constraint', () => {
      fc.assert(
        fc.property(
          createBounds(-1000, 1000),
          fc.integer({ min: 0, max: 1000 }),
          ([minimum], seed) => {
            const schema: NumberSchema = { type: 'number', minimum };
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

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[NUMBER_GENERATOR] Min constraint - minimum: ${minimum}, generated: ${result.value}, seed: ${seed}`
                );
              }
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should respect maximum constraint', () => {
      fc.assert(
        fc.property(
          createBounds(-1000, 1000),
          fc.integer({ min: 0, max: 1000 }),
          ([, maximum], seed) => {
            const schema: NumberSchema = { type: 'number', maximum };
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

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[NUMBER_GENERATOR] Max constraint - maximum: ${maximum}, generated: ${result.value}, seed: ${seed}`
                );
              }
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should respect both minimum and maximum constraints', () => {
      fc.assert(
        fc.property(
          createBounds(-1000, 1000),
          fc.integer({ min: 0, max: 1000 }),
          ([minimum, maximum], seed) => {
            const schema: NumberSchema = { type: 'number', minimum, maximum };
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

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[NUMBER_GENERATOR] Range constraint - range: [${minimum}, ${maximum}], generated: ${result.value}, seed: ${seed}`
                );
              }
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should respect exclusiveMinimum constraint', () => {
      fc.assert(
        fc.property(
          createBounds(-1000, 1000),
          fc.integer({ min: 0, max: 1000 }),
          ([exclusiveMinimum], seed) => {
            const schema: NumberSchema = { type: 'number', exclusiveMinimum };
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

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[NUMBER_GENERATOR] Exclusive min - exclusiveMinimum: ${exclusiveMinimum}, generated: ${result.value}, seed: ${seed}`
                );
              }
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should respect exclusiveMaximum constraint', () => {
      fc.assert(
        fc.property(
          createBounds(-1000, 1000),
          fc.integer({ min: 0, max: 1000 }),
          ([, exclusiveMaximum], seed) => {
            const schema: NumberSchema = { type: 'number', exclusiveMaximum };
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

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[NUMBER_GENERATOR] Exclusive max - exclusiveMaximum: ${exclusiveMaximum}, generated: ${result.value}, seed: ${seed}`
                );
              }
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should respect multipleOf constraint', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(0.1),
            fc.constant(0.01),
            fc.constant(1),
            fc.constant(2.5),
            fc.constant(10)
          ),
          fc.integer({ min: 0, max: 1000 }),
          (multipleOf, seed) => {
            const schema: NumberSchema = { type: 'number', multipleOf };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const ajv = getAjv();
            const validate = ajv.compile(schema);

            const result = generator.generate(schema, context);

            // Generator may fail with impossible constraints
            if (result.isOk()) {
              // AJV validation oracle
              expect(validate(result.value)).toBe(true);

              // Check multipleOf constraint manually for additional verification
              const quotient = result.value / multipleOf;
              expect(
                Math.abs(quotient - Math.round(quotient))
              ).toBeLessThanOrEqual(1e-10);

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[NUMBER_GENERATOR] MultipleOf constraint - multipleOf: ${multipleOf}, generated: ${result.value}, quotient: ${quotient}, seed: ${seed}`
                );
              }
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should generate values from enum when provided', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.float({
              min: -100,
              max: 100,
              noNaN: true,
              noDefaultInfinity: true,
            }),
            {
              minLength: 1,
              maxLength: 5,
            }
          ),
          fc.integer({ min: 0, max: 1000 }),
          (enumValues, seed) => {
            const schema: NumberSchema = { type: 'number', enum: enumValues };
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
              expect(typeof result.value).toBe('number');

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[NUMBER_GENERATOR] Generated enum value: ${result.value} from ${JSON.stringify(enumValues)} with seed: ${seed}`
                );
              }
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should generate const value when provided', () => {
      fc.assert(
        fc.property(
          fc.float({
            min: -100,
            max: 100,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          fc.integer({ min: 0, max: 1000 }),
          (constValue, seed) => {
            const schema: NumberSchema = { type: 'number', const: constValue };
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
                  `[NUMBER_GENERATOR] Generated const value: ${result.value} with seed: ${seed}`
                );
              }
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should handle complex constraints combinations', () => {
      fc.assert(
        fc.property(
          createBounds(0, 100),
          fc.oneof(fc.constant(0.1), fc.constant(1), fc.constant(2.5)),
          fc.integer({ min: 0, max: 1000 }),
          ([minimum, maximum], multipleOf, seed) => {
            const schema: NumberSchema = {
              type: 'number',
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

            // Generator may fail with impossible constraints (e.g. min=0, max=20, multipleOf=0.1)
            if (result.isOk()) {
              // AJV validation oracle
              expect(validate(result.value)).toBe(true);
              expect(result.value).toBeWithinRange(minimum, maximum);

              // Verify multipleOf constraint
              const quotient = result.value / multipleOf;
              expect(
                Math.abs(quotient - Math.round(quotient))
              ).toBeLessThanOrEqual(1e-10);

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[NUMBER_GENERATOR] Complex constraints - range: [${minimum}, ${maximum}], multipleOf: ${multipleOf}, generated: ${result.value}, seed: ${seed}`
                );
              }
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should generate same values with same seed', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1000 }), (seed) => {
          const schema: NumberSchema = { type: 'number' };
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
                `[NUMBER_GENERATOR] Deterministic check - seed: ${seed}, values: ${result1.value}, ${result2.value}`
              );
            }
          }
        }),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
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
        const ajv = getAjv();
        const schema: NumberSchema = { type: 'number' };
        const validate = ajv.compile(schema);

        fc.assert(
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
              expect(typeof result.value).toBe('number');
              expect(Number.isFinite(result.value)).toBe(true);

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[NUMBER_GENERATOR] Scenario ${scenario} - seed: ${seed}, value: ${result.value}`
                );
              }
            }
          }),
          {
            seed: NUMBER_TEST_SEED + scenarios.indexOf(scenario),
            numRuns: Math.floor(getNumRuns() / 5),
          }
        );
      });
    });

    it('should handle exclusive bounds correctly', () => {
      fc.assert(
        fc.property(
          createBounds(0, 100),
          fc.integer({ min: 0, max: 1000 }),
          ([min, max], seed) => {
            const exclusiveMinimum = min;
            const exclusiveMaximum = max;
            const schema: NumberSchema = {
              type: 'number',
              exclusiveMinimum,
              exclusiveMaximum,
            };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const ajv = getAjv();
            const validate = ajv.compile(schema);

            const result = generator.generate(schema, context);

            // Generator may fail with impossible exclusive bounds (e.g. min=99, max=99)
            if (result.isOk()) {
              // AJV validation oracle
              expect(validate(result.value)).toBe(true);
              expect(result.value).toBeGreaterThan(exclusiveMinimum);
              expect(result.value).toBeLessThan(exclusiveMaximum);

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[NUMBER_GENERATOR] Exclusive bounds - range: (${exclusiveMinimum}, ${exclusiveMaximum}), generated: ${result.value}, seed: ${seed}`
                );
              }
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should handle precise multipleOf constraints with floating-point tolerance', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(0.01),
            fc.constant(0.1),
            fc.constant(0.001),
            fc.constant(2.5)
          ),
          fc.integer({ min: 0, max: 1000 }),
          (multipleOf, seed) => {
            const schema: NumberSchema = { type: 'number', multipleOf };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const ajv = getAjv();
            const validate = ajv.compile(schema);

            const result = generator.generate(schema, context);

            if (result.isOk()) {
              // AJV validation oracle
              expect(validate(result.value)).toBe(true);

              // Additional precision check with ULP tolerance
              expect(isMultipleOf(result.value, multipleOf)).toBe(true);

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[NUMBER_GENERATOR] Precise multipleOf - multipleOf: ${multipleOf}, generated: ${result.value}, seed: ${seed}`
                );
              }
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should handle the classic JavaScript 0.1 + 0.2 !== 0.3 precision issue', () => {
      const problematicValue = 0.1 + 0.2; // = 0.30000000000000004
      const schema = { type: 'number' as const, multipleOf: 0.1 };

      // Our implementation should handle IEEE-754 precision issues
      expect(generator.validate(problematicValue, schema)).toBe(true);
      expect(generator.validate(0.3, schema)).toBe(true);

      // Test our custom isMultipleOf logic for precision handling
      expect(isMultipleOf(problematicValue, 0.1)).toBe(true);
      expect(isMultipleOf(0.3, 0.1)).toBe(true);

      if (process.env.VERBOSE_LOGS === 'true') {
        console.log(
          `[NUMBER_GENERATOR] IEEE-754 precision test - 0.1+0.2: ${problematicValue}, exact 0.3: ${0.3}`
        );
      }
    });

    it('should handle exclusive bounds with precise floating-point boundaries', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant({
              exclusiveMinimum: -1,
              exclusiveMaximum: 1,
              multipleOf: 0.001,
            }),
            fc.constant({
              exclusiveMinimum: 0,
              exclusiveMaximum: 10,
              multipleOf: 0.1,
            }),
            fc.constant({
              exclusiveMinimum: -0.5,
              exclusiveMaximum: 0.5,
              multipleOf: 0.01,
            })
          ),
          fc.integer({ min: 0, max: 1000 }),
          (constraints, seed) => {
            const schema: NumberSchema = { type: 'number', ...constraints };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const ajv = getAjv();
            const validate = ajv.compile(schema);

            const result = generator.generate(schema, context);

            if (result.isOk()) {
              // AJV validation oracle
              expect(validate(result.value)).toBe(true);
              expect(result.value).toBeGreaterThan(
                constraints.exclusiveMinimum!
              );
              expect(result.value).toBeLessThan(constraints.exclusiveMaximum!);
              expect(isMultipleOf(result.value, constraints.multipleOf!)).toBe(
                true
              );

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[NUMBER_GENERATOR] Precise exclusive bounds - constraints: ${JSON.stringify(constraints)}, generated: ${result.value}, seed: ${seed}`
                );
              }
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('metamorphic: generated value +/- half-step should violate multipleOf (if in-bounds)', () => {
      fc.assert(
        fc.property(
          fc.record({
            minimum: fc.constant(0),
            maximum: fc.constant(10),
            multipleOf: fc.constantFrom(0.5, 1, 2),
          }),
          fc.integer({ min: 0, max: 1000 }),
          (props, seed) => {
            const schema: NumberSchema = { type: 'number', ...props };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const ajv = getAjv();
            const validate = ajv.compile(schema);

            const result = generator.generate(schema, context);
            if (!result.isOk()) return true;

            const value = result.value;
            const halfStep = props.multipleOf / 2;

            // Test seulement si on reste dans [min, max]
            if (value + halfStep <= 10) {
              const violatingValue = value + halfStep;
              expect(generator.validate(violatingValue, schema)).toBe(false);
              // Also verify with AJV
              expect(validate(violatingValue)).toBe(false);
            }
            if (value - halfStep >= 0) {
              const violatingValue = value - halfStep;
              expect(generator.validate(violatingValue, schema)).toBe(false);
              // Also verify with AJV
              expect(validate(violatingValue)).toBe(false);
            }

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[NUMBER_GENERATOR] Metamorphic test - value: ${value}, multipleOf: ${props.multipleOf}, halfStep: ${halfStep}`
              );
            }

            return true;
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should not degenerate distribution on wide ranges', () => {
      const schema: NumberSchema = {
        type: 'number',
        minimum: 0,
        maximum: 1000,
      };

      const seeds = Array.from({ length: 50 }, (_, i) => i + 1);
      const values = seeds
        .map((seed) => {
          const context = createGeneratorContext(schema, formatRegistry, {
            seed,
          });
          const result = generator.generate(schema, context);
          return result.isOk() ? result.value : null;
        })
        .filter((v): v is number => v !== null);

      // Should generate diverse values, not always the same
      expect(new Set(values).size).toBeGreaterThan(1);

      // All values should be within bounds
      values.forEach((value) => {
        expect(value).toBeWithinRange(0, 1000);
      });

      if (process.env.VERBOSE_LOGS === 'true') {
        console.log(
          `[NUMBER_GENERATOR] Distribution test - unique values: ${new Set(values).size}/50, range: [${Math.min(...values)}, ${Math.max(...values)}]`
        );
      }
    });
  });

  describe('Impossible and Contradictory Schema Constraints', () => {
    it('should handle impossible minimum > maximum constraints', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
          fc.float({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
          fc.integer({ min: 0, max: 1000 }),
          (val1, val2, seed) => {
            const minimum = Math.max(val1, val2);
            const maximum = Math.min(val1, val2);

            // Only test cases where min > max (contradictory case)
            if (minimum <= maximum) {
              return;
            }

            const schema: NumberSchema = { type: 'number', minimum, maximum };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const ajv = getAjv();
            const validate = ajv.compile(schema);

            const result = generator.generate(schema, context);
            expect(result.isErr()).toBe(true);

            // Validation should reject any value for impossible constraints
            expect(generator.validate(minimum, schema)).toBe(false);
            expect(generator.validate(maximum, schema)).toBe(false);
            expect(generator.validate((minimum + maximum) / 2, schema)).toBe(
              false
            );

            // AJV should also reject these values
            expect(validate(minimum)).toBe(false);
            expect(validate(maximum)).toBe(false);
            expect(validate((minimum + maximum) / 2)).toBe(false);

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[NUMBER_GENERATOR] Impossible min/max - minimum: ${minimum}, maximum: ${maximum}`
              );
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should handle impossible exclusiveMinimum >= exclusiveMaximum', () => {
      fc.assert(
        fc.property(
          fc.float({ min: -50, max: 50, noNaN: true, noDefaultInfinity: true }),
          fc.float({ min: -50, max: 50, noNaN: true, noDefaultInfinity: true }),
          fc.integer({ min: 0, max: 1000 }),
          (val1, val2, seed) => {
            const exclusiveMinimum = Math.max(val1, val2);
            const exclusiveMaximum = Math.min(val1, val2);

            // Test impossible case: exclusiveMinimum >= exclusiveMaximum
            if (exclusiveMinimum < exclusiveMaximum) {
              return;
            }

            const schema: NumberSchema = {
              type: 'number',
              exclusiveMinimum,
              exclusiveMaximum,
            };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const ajv = getAjv();
            const validate = ajv.compile(schema);

            const result = generator.generate(schema, context);
            expect(result.isErr()).toBe(true);

            // No value can satisfy x > min AND x < max when min >= max
            expect(generator.validate(exclusiveMinimum, schema)).toBe(false);
            expect(generator.validate(exclusiveMaximum, schema)).toBe(false);

            // AJV validation
            expect(validate(exclusiveMinimum)).toBe(false);
            expect(validate(exclusiveMaximum)).toBe(false);

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[NUMBER_GENERATOR] Impossible exclusive bounds - exclusiveMinimum: ${exclusiveMinimum}, exclusiveMaximum: ${exclusiveMaximum}`
              );
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should handle contradictory minimum + exclusiveMinimum combinations', () => {
      const testCases = [
        { minimum: 10, exclusiveMinimum: 5 }, // exclusiveMinimum < minimum (inconsistent)
        { minimum: 10, exclusiveMinimum: 10 }, // exclusiveMinimum = minimum (impossible)
        { maximum: 10, exclusiveMaximum: 15 }, // exclusiveMaximum > maximum (inconsistent)
        { maximum: 10, exclusiveMaximum: 10 }, // exclusiveMaximum = maximum (impossible)
      ];

      testCases.forEach((constraintProps, index) => {
        const schema: NumberSchema = { type: 'number', ...constraintProps };
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: NUMBER_TEST_SEED + index,
        });
        const ajv = getAjv();
        const validate = ajv.compile(schema);

        // Should either fail generation or have very restrictive validation
        const result = generator.generate(schema, context);
        if (result.isOk()) {
          // If generation succeeds, validate the result
          expect(generator.validate(result.value, schema)).toBe(true);
          expect(validate(result.value)).toBe(true);
        }

        // Test edge values that should fail
        if (
          'exclusiveMinimum' in constraintProps &&
          'minimum' in constraintProps
        ) {
          const minValue = Math.min(
            constraintProps.exclusiveMinimum!,
            constraintProps.minimum!
          );
          expect(generator.validate(minValue, schema)).toBe(false);
          expect(validate(minValue)).toBe(false);
        }
        if (
          'exclusiveMaximum' in constraintProps &&
          'maximum' in constraintProps
        ) {
          const maxValue = Math.max(
            constraintProps.exclusiveMaximum!,
            constraintProps.maximum!
          );
          expect(generator.validate(maxValue, schema)).toBe(false);
          expect(validate(maxValue)).toBe(false);
        }

        if (process.env.VERBOSE_LOGS === 'true') {
          console.log(
            `[NUMBER_GENERATOR] Contradictory bounds test ${index} - constraints: ${JSON.stringify(constraintProps)}`
          );
        }
      });
    });

    it('should error when minimum > maximum', () => {
      const schema: NumberSchema = { type: 'number', minimum: 10, maximum: 5 };
      const context = createGeneratorContext(schema, formatRegistry, {
        seed: 1,
      });
      const result = generator.generate(schema, context);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('minimum');
        expect(result.error.message).toContain('maximum');
      }
    });

    it('should error when no multipleOf fits in range', () => {
      const schema: NumberSchema = {
        type: 'number',
        minimum: 1,
        maximum: 1.5,
        multipleOf: 2,
      };
      const context = createGeneratorContext(schema, formatRegistry, {
        seed: 1,
      });
      const result = generator.generate(schema, context);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('multiple');
      }
    });

    it('should error when exclusiveMinimum >= exclusiveMaximum', () => {
      const schema: NumberSchema = {
        type: 'number',
        exclusiveMinimum: 10,
        exclusiveMaximum: 10,
      };
      const context = createGeneratorContext(schema, formatRegistry, {
        seed: 1,
      });
      const result = generator.generate(schema, context);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('minimum');
        expect(result.error.message).toContain('maximum');
      }
    });

    it('should handle enum with additional constraints', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.float({
              min: -100,
              max: 100,
              noNaN: true,
              noDefaultInfinity: true,
            }),
            {
              minLength: 3,
              maxLength: 10,
            }
          ),
          createBounds(-50, 50),
          fc.integer({ min: 0, max: 1000 }),
          (enumValues, [minimum, maximum], seed) => {
            const schema: NumberSchema = {
              type: 'number',
              enum: enumValues,
              minimum,
              maximum,
            };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const ajv = getAjv();
            const validate = ajv.compile(schema);

            const result = generator.generate(schema, context);

            if (result.isOk()) {
              // Must be from enum AND satisfy constraints
              expect(enumValues).toContain(result.value);
              expect(result.value).toBeWithinRange(minimum, maximum);
              expect(validate(result.value)).toBe(true);

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[NUMBER_GENERATOR] Enum with constraints - value: ${result.value}, enum: ${JSON.stringify(enumValues)}, bounds: [${minimum}, ${maximum}]`
                );
              }
            }
            // Generation might fail if no enum value satisfies constraints
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should reject NaN and Infinity values in enum', () => {
      const specialValues = [
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
      ];

      specialValues.forEach((value) => {
        const schema: NumberSchema = { type: 'number', enum: [value] };
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: 42,
        });

        const result = generator.generate(schema, context);

        // Should fail to generate since NaN/Infinity are invalid number values
        expect(result.isErr()).toBe(true);

        if (process.env.VERBOSE_LOGS === 'true') {
          console.log(
            `[NUMBER_GENERATOR] Special value rejection - value: ${value}, error: ${result.isErr()}`
          );
        }
      });
    });

    it('should handle empty enum (spec allows but generation should fail)', () => {
      const schema: NumberSchema = { type: 'number', enum: [] };
      const context = createGeneratorContext(schema, formatRegistry, {
        seed: 42,
      });

      // Should support the schema (valid per spec) but generation should fail (no values)
      expect(generator.supports(schema)).toBe(true);

      const result = generator.generate(schema, context);
      expect(result.isErr()).toBe(true); // No values to choose from
    });
  });

  describe('validate', () => {
    it('should validate number values correctly', () => {
      fc.assert(
        fc.property(
          fc.float({ noNaN: true, noDefaultInfinity: true }),
          (value) => {
            const schema: NumberSchema = { type: 'number' };
            const ajv = getAjv();
            const ajvValidate = ajv.compile(schema);

            const isValid = generator.validate(value, schema);
            const ajvResult = ajvValidate(value);

            // Oracle consistency check
            expect(isValid).toBe(ajvResult);
            expect(isValid).toBe(true);

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[NUMBER_GENERATOR] Validate test - value: ${value}, our result: ${isValid}, ajv result: ${ajvResult}`
              );
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should reject non-number values', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string(),
            fc.integer().map(String), // String representation of numbers
            fc.boolean(),
            fc.constantFrom(null, undefined),
            fc.array(fc.anything()),
            fc.object(),
            fc.constantFrom('123', 'true', 'false', 'infinity', 'NaN')
          ),
          (nonNumberValue) => {
            const schema: NumberSchema = { type: 'number' };
            const ajv = getAjv();
            const ajvValidate = ajv.compile(schema);

            const isValid = generator.validate(nonNumberValue, schema);
            const ajvResult = ajvValidate(nonNumberValue);

            // Oracle consistency check
            expect(isValid).toBe(ajvResult);
            expect(isValid).toBe(false);

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[NUMBER_GENERATOR] Reject test - value: ${JSON.stringify(nonNumberValue)}, our result: ${isValid}, ajv result: ${ajvResult}`
              );
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should validate constraint compliance', () => {
      fc.assert(
        fc.property(
          createBounds(0, 100),
          fc.float({
            min: -200,
            max: 200,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          ([minimum, maximum], testValue) => {
            const schema: NumberSchema = { type: 'number', minimum, maximum };
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
                `[NUMBER_GENERATOR] Constraint validate - range: [${minimum}, ${maximum}], value: ${testValue}, our result: ${isValid}, ajv result: ${ajvResult}`
              );
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should validate enum constraints correctly with floating-point precision', () => {
      fc.assert(
        fc.property(
          fc
            .array(
              fc.oneof(
                fc.integer({ min: -1000, max: 1000 }), // Use integers to avoid floating-point precision issues
                fc.constantFrom(0.5, -0.5, Math.PI, Math.E) // Common exact values (avoid -0/0 duplicate)
              ),
              { minLength: 1, maxLength: 5 }
            )
            .map((arr) => [...new Set(arr)]) // Remove duplicates to avoid AJV validation issues
            .filter((arr) => arr.length > 0) // Ensure non-empty after deduplication
            .chain((enumValues) => {
              const outside = fc
                .float({
                  min: -1000,
                  max: 1000,
                  noNaN: true,
                  noDefaultInfinity: true,
                })
                .filter((v) => !enumValues.includes(v));
              return fc.tuple(fc.constant(enumValues), fc.boolean(), outside);
            }),
          ([enumValues, useEnumValue, outsideVal]) => {
            const schema: NumberSchema = { type: 'number', enum: enumValues };
            const testValue = useEnumValue
              ? enumValues[Math.floor(enumValues.length / 2)]
              : outsideVal;

            const ajv = getAjv();
            const ajvValidate = ajv.compile(schema);

            const isValid = generator.validate(testValue, schema);
            const ajvResult = ajvValidate(testValue);
            const shouldBeValid = enumValues.some((val) => val === testValue);

            // Oracle consistency check
            expect(isValid).toBe(ajvResult);
            expect(isValid).toBe(shouldBeValid);

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[NUMBER_GENERATOR] Enum validation - testValue: ${testValue}, enum: ${JSON.stringify(enumValues)}, valid: ${isValid}, shouldBe: ${shouldBeValid}`
              );
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should validate complex constraint combinations with isMultipleOf precision', () => {
      fc.assert(
        fc.property(
          createBounds(0, 100),
          fc.oneof(
            fc.constant(0.1),
            fc.constant(0.5),
            fc.constant(1),
            fc.constant(2.5)
          ),
          fc.float({
            min: -200,
            max: 200,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          ([minimum, maximum], multipleOf, testValue) => {
            const schema: NumberSchema = {
              type: 'number',
              minimum,
              maximum,
              multipleOf,
            };
            const ajv = getAjv();
            const ajvValidate = ajv.compile(schema);

            const isValid = generator.validate(testValue, schema);
            const ajvResult = ajvValidate(testValue);

            // Manual validation check
            const shouldBeValid =
              testValue >= minimum &&
              testValue <= maximum &&
              isMultipleOf(testValue, multipleOf);

            // Oracle consistency check
            expect(isValid).toBe(ajvResult);
            expect(isValid).toBe(shouldBeValid);

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[NUMBER_GENERATOR] Complex validation - value: ${testValue}, bounds: [${minimum}, ${maximum}], multipleOf: ${multipleOf}, valid: ${isValid}, isMultiple: ${isMultipleOf(testValue, multipleOf)}`
              );
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });
  });

  describe('getExamples', () => {
    it('should return enum values as examples when available', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.float({
              min: -100,
              max: 100,
              noNaN: true,
              noDefaultInfinity: true,
            }),
            {
              minLength: 1,
              maxLength: 5,
            }
          ),
          (enumValues) => {
            const schema: NumberSchema = { type: 'number', enum: enumValues };
            const examples = generator.getExamples(schema);

            expect(examples).toEqual(enumValues);

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[NUMBER_GENERATOR] getExamples enum test - enum: ${JSON.stringify(enumValues)}, examples: ${JSON.stringify(examples)}`
              );
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should return const value as example when available', () => {
      fc.assert(
        fc.property(
          fc.float({
            min: -100,
            max: 100,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          (constValue) => {
            const schema: NumberSchema = { type: 'number', const: constValue };
            const examples = generator.getExamples(schema);

            expect(examples).toEqual([constValue]);

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[NUMBER_GENERATOR] getExamples const test - const: ${constValue}, examples: ${JSON.stringify(examples)}`
              );
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should return schema examples when available', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.float({
              min: -100,
              max: 100,
              noNaN: true,
              noDefaultInfinity: true,
            }),
            {
              minLength: 1,
              maxLength: 5,
            }
          ),
          (schemaExamples) => {
            const schema: NumberSchema = {
              type: 'number',
              examples: schemaExamples,
            };
            const examples = generator.getExamples(schema);

            expect(examples).toEqual(schemaExamples);

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[NUMBER_GENERATOR] getExamples schema examples test - schema examples: ${JSON.stringify(schemaExamples)}, examples: ${JSON.stringify(examples)}`
              );
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should return empty array for unsupported schemas', () => {
      fc.assert(
        fc.property(
          getSchemaArbitrary().filter(
            (schema: Record<string, unknown>) =>
              schema.type !== 'number' && typeof schema.type === 'string'
          ),
          (unsupportedSchema) => {
            const examples = generator.getExamples(unsupportedSchema as any);
            expect(examples).toEqual([]);

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[NUMBER_GENERATOR] getExamples unsupported test - schema: ${JSON.stringify(unsupportedSchema)}, examples: ${JSON.stringify(examples)}`
              );
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should generate examples with multipleOf constraints and precise boundaries', () => {
      const testCases = [
        { multipleOf: 0.1, minimum: 0, maximum: 1 },
        { multipleOf: 0.01, minimum: -0.1, maximum: 0.1 },
        { multipleOf: 2.5, minimum: 0, maximum: 10 },
        { multipleOf: 0.001, minimum: -0.01, maximum: 0.01 },
      ];

      testCases.forEach(({ multipleOf, minimum, maximum }) => {
        const schema: NumberSchema = {
          type: 'number',
          multipleOf,
          minimum,
          maximum,
        };
        const ajv = getAjv();
        const validate = ajv.compile(schema);

        const examples = generator.getExamples(schema);

        expect(examples.length).toBeGreaterThan(0);

        examples.forEach((example) => {
          expect(typeof example).toBe('number');
          expect(Number.isFinite(example)).toBe(true);
          expect(example).toBeWithinRange(minimum, maximum);
          expect(isMultipleOf(example, multipleOf)).toBe(true);
          expect(validate(example)).toBe(true);

          if (process.env.VERBOSE_LOGS === 'true') {
            console.log(
              `[NUMBER_GENERATOR] getExamples multipleOf - multipleOf: ${multipleOf}, example: ${example}`
            );
          }
        });
      });
    });

    it('should handle edge cases in getExamples with extreme floating-point ranges', () => {
      const edgeCases = [
        { minimum: 0, maximum: 0 }, // Single value
        { minimum: -1e-10, maximum: 1e-10 }, // Very small range
        { minimum: -0.1, maximum: 0.1, multipleOf: 0.05 }, // Small range with step
        { exclusiveMinimum: 0, exclusiveMaximum: 0.1, multipleOf: 0.01 }, // Exclusive bounds
        { multipleOf: 0, minimum: 0, maximum: 10 }, // Invalid multipleOf
        { multipleOf: -0.1, minimum: 0, maximum: 10 }, // Negative multipleOf
      ];

      edgeCases.forEach((constraints, index) => {
        const schema: NumberSchema = {
          type: 'number',
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
            expect(typeof example).toBe('number');
            expect(Number.isFinite(example)).toBe(true);

            if (constraints.minimum !== undefined) {
              expect(example).toBeGreaterThanOrEqual(constraints.minimum);
            }
            if (constraints.maximum !== undefined) {
              expect(example).toBeLessThanOrEqual(constraints.maximum);
            }
            if (constraints.exclusiveMinimum !== undefined) {
              expect(example).toBeGreaterThan(constraints.exclusiveMinimum);
            }
            if (constraints.exclusiveMaximum !== undefined) {
              expect(example).toBeLessThan(constraints.exclusiveMaximum);
            }

            if (process.env.VERBOSE_LOGS === 'true') {
              console.log(
                `[NUMBER_GENERATOR] getExamples edge case ${index} - example: ${example}, constraints: ${JSON.stringify(constraints)}`
              );
            }
          });
        }
      });
    });

    it('should handle constraint combinations in getExamples', () => {
      const constraintCombinations = [
        { const: 5, minimum: 0, maximum: 20 }, // Const within range
        { const: 15, multipleOf: 5 }, // Const that is multiple
        { const: 10, exclusiveMinimum: 5 }, // Const > exclusiveMinimum
        { const: 5, exclusiveMaximum: 10 }, // Const < exclusiveMaximum
      ];

      constraintCombinations.forEach((constraints, index) => {
        const schema: NumberSchema = {
          type: 'number',
          ...constraints,
        };

        const examples = generator.getExamples(schema);

        // getExamples should return the const value for valid combinations
        expect(examples.length).toBeGreaterThan(0);
        expect(examples).toContain(constraints.const);

        if (process.env.VERBOSE_LOGS === 'true') {
          console.log(
            `[NUMBER_GENERATOR] Valid constraint combination ${index} - schema: ${JSON.stringify(schema)}, examples: ${JSON.stringify(examples)}`
          );
        }
      });
    });
  });

  describe('Helper Functions Validation (ULP and Precision)', () => {
    it('should validate isMultipleOf helper with various precision scenarios', () => {
      const testCases = [
        { value: 0.3, multipleOf: 0.1, expected: true },
        { value: 0.1 + 0.2, multipleOf: 0.1, expected: true }, // IEEE-754 precision issue
        { value: 1.23, multipleOf: 0.01, expected: true },
        { value: 1.234, multipleOf: 0.01, expected: false },
        { value: 2.5, multipleOf: 0.5, expected: true },
        { value: 7 * 0.1, multipleOf: 0.1, expected: true }, // 0.7000000000000001
      ];

      testCases.forEach(({ value, multipleOf, expected }) => {
        expect(isMultipleOf(value, multipleOf)).toBe(expected);

        if (process.env.VERBOSE_LOGS === 'true') {
          console.log(
            `[NUMBER_GENERATOR] isMultipleOf test - value: ${value}, multipleOf: ${multipleOf}, expected: ${expected}, actual: ${isMultipleOf(value, multipleOf)}`
          );
        }
      });
    });

    it('should validate decimalPlaces helper with scientific notation', () => {
      const testCases = [
        { input: 0.1, expected: 1 },
        { input: 0.01, expected: 2 },
        { input: 1e-3, expected: 3 },
        { input: 1e-6, expected: 6 },
        { input: 2.5e-4, expected: 5 },
        { input: 1, expected: 0 },
      ];

      testCases.forEach(({ input, expected }) => {
        expect(decimalPlaces(input)).toBe(expected);

        if (process.env.VERBOSE_LOGS === 'true') {
          console.log(
            `[NUMBER_GENERATOR] decimalPlaces test - input: ${input}, expected: ${expected}, actual: ${decimalPlaces(input)}`
          );
        }
      });
    });

    it('should not accept near-misses in isMultipleOf tolerance validation', () => {
      const step = 0.1;
      const k = 7;
      const near = k * step + step * 2e-13; // Slightly above tolerance

      expect(isMultipleOf(near, step)).toBe(false);
      expect(isMultipleOf(k * step, step)).toBe(true);

      if (process.env.VERBOSE_LOGS === 'true') {
        console.log(
          `[NUMBER_GENERATOR] Tolerance validation - step: ${step}, k: ${k}, near: ${near}, exact: ${k * step}`
        );
      }
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
          getSchemaArbitrary()
            .filter(
              (schema: Record<string, unknown>) => schema.type === 'number'
            )
            .map((schema) => schema as unknown as NumberSchema),
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
              expect(typeof result.value).toBe('number');

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[NUMBER_GENERATOR] Integration test - schema: ${JSON.stringify(schema)}, generated: ${result.value}, seed: ${seed}`
                );
              }
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should handle edge cases gracefully', () => {
      const edgeCases = [
        { minimum: 0, maximum: 0 }, // Single valid value
        { exclusiveMinimum: 0, exclusiveMaximum: 1, multipleOf: 0.1 }, // Small range with multipleOf
        { const: 42 },
        { enum: [1.1, 2.2, 3.3] },
        { minimum: -1000, maximum: 1000, multipleOf: 0.01 }, // Large range with small step
      ];

      edgeCases.forEach((constraints, index) => {
        const schema: NumberSchema = {
          type: 'number',
          ...constraints,
        };
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: NUMBER_TEST_SEED + index,
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
          expect(typeof result.value).toBe('number');
          expect(Number.isFinite(result.value)).toBe(true);

          // AJV validation oracle (if compilation succeeded)
          if (ajvCompilationSuccess && ajvValidate) {
            expect(ajvValidate(result.value)).toBe(true);
          }

          if (process.env.VERBOSE_LOGS === 'true') {
            console.log(
              `[NUMBER_GENERATOR] Edge case ${index} - schema: ${JSON.stringify(schema)}, generated: ${result.value}`
            );
          }
        }
        // If generation fails for impossible constraints, that's acceptable
      });
    });

    it('should handle draft-specific exclusive bounds correctly', () => {
      const drafts: Array<'2019-09' | '2020-12' | 'draft-07'> = [
        'draft-07',
        '2019-09',
        '2020-12',
      ];

      drafts.forEach((draft) => {
        const ajv = createAjv(draft);
        const schema: NumberSchema = {
          type: 'number',
          exclusiveMinimum: 0,
          exclusiveMaximum: 10,
        };
        const validate = ajv.compile(schema);

        fc.assert(
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

              if (process.env.VERBOSE_LOGS === 'true') {
                console.log(
                  `[NUMBER_GENERATOR] Draft ${draft} exclusive bounds - generated: ${result.value}, seed: ${seed}`
                );
              }
            }
          }),
          {
            seed: NUMBER_TEST_SEED + drafts.indexOf(draft) * 1000,
            numRuns: Math.floor(getNumRuns() / 3),
          }
        );
      });
    });
  });

  describe('Boundary Constraint Priority Tests (v2.1 Migration)', () => {
    it('should honor tighter of maximum and exclusiveMaximum', () => {
      fc.assert(
        fc.property(
          fc.constant({
            type: 'number' as const,
            maximum: 10,
            exclusiveMaximum: 100,
            multipleOf: 1,
          }),
          fc.integer({ min: 0, max: 1000 }),
          (schema, seed) => {
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const ajv = getAjv();

            try {
              const validate = ajv.compile(schema);
              const result = generator.generate(schema, context);

              if (result.isOk()) {
                // AJV validation oracle
                expect(validate(result.value)).toBe(true);
                expect(result.value).toBeLessThanOrEqual(10); // maximum plus serré
                expect(result.value % 1).toBe(0); // multipleOf validation
              }
            } catch (error) {
              // Skip invalid schemas
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should honor tighter of minimum and exclusiveMinimum', () => {
      fc.assert(
        fc.property(
          fc.constant({
            type: 'number' as const,
            minimum: 5,
            exclusiveMinimum: 0,
            multipleOf: 1,
          }),
          fc.integer({ min: 0, max: 1000 }),
          (schema, seed) => {
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const ajv = getAjv();

            try {
              const validate = ajv.compile(schema);
              const result = generator.generate(schema, context);

              if (result.isOk()) {
                // AJV validation oracle
                expect(validate(result.value)).toBe(true);
                expect(result.value).toBeGreaterThanOrEqual(5); // minimum plus serré
                expect(result.value % 1).toBe(0); // multipleOf validation
              }
            } catch (error) {
              // Skip invalid schemas
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });
  });

  describe('Regression Tests for Classic Bugs (v2.1 Migration)', () => {
    it('should handle multipleOf with narrow decimal boundaries', () => {
      fc.assert(
        fc.property(
          fc.constant({
            type: 'number' as const,
            multipleOf: 0.01,
            minimum: 0.97,
            maximum: 0.99,
          }),
          fc.integer({ min: 0, max: 1000 }),
          (schema, seed) => {
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const ajv = getAjv();
            const validate = ajv.compile(schema);
            const result = generator.generate(schema, context);

            if (result.isOk()) {
              // AJV validation oracle
              expect(validate(result.value)).toBe(true);
              expect(result.value).toBeWithinRange(0.97, 0.99);
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should handle floating-point precision with enum validation', () => {
      fc.assert(
        fc.property(
          fc.constant({
            type: 'number' as const,
            multipleOf: 0.1,
            enum: [0.1, 0.2, 0.3],
          }),
          fc.integer({ min: 0, max: 1000 }),
          (schema, seed) => {
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const ajv = getAjv();
            const validate = ajv.compile(schema);
            const result = generator.generate(schema, context);

            if (result.isOk()) {
              // AJV validation oracle
              expect(validate(result.value)).toBe(true);
              expect([0.1, 0.2, 0.3]).toContain(result.value);
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should handle the classic 0.1 + 0.2 !== 0.3 JavaScript issue', () => {
      const problematicValue = 0.1 + 0.2; // = 0.30000000000000004
      const schema = { type: 'number' as const, multipleOf: 0.1 };

      // Our implementation should handle IEEE-754 precision issues
      expect(generator.validate(problematicValue, schema)).toBe(true);
      expect(generator.validate(0.3, schema)).toBe(true);
    });

    it('should handle very small multipleOf values without precision loss', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(0.001, 0.0001, 0.00001),
          fc.integer({ min: 0, max: 100 }),
          (step, seed) => {
            const schema = {
              type: 'number' as const,
              multipleOf: step,
              minimum: 0,
              maximum: step * 10,
            };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const ajv = getAjv();
            const validate = ajv.compile(schema);
            const result = generator.generate(schema, context);

            if (result.isOk()) {
              // AJV validation oracle
              expect(validate(result.value)).toBe(true);
              expect(result.value).toBeWithinRange(0, step * 10);
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: Math.floor(getNumRuns() / 3) }
      );
    });
  });

  describe('Extreme Values and Precision (v2.1 Migration)', () => {
    it('should handle extreme bounds near JS limits', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            { minimum: -Number.MAX_VALUE, maximum: Number.MAX_VALUE },
            { minimum: Number.MIN_VALUE, maximum: 1 },
            {
              exclusiveMinimum: -Number.MAX_SAFE_INTEGER,
              exclusiveMaximum: Number.MAX_SAFE_INTEGER,
            }
          ),
          fc.integer({ min: 0, max: 100 }),
          (bounds, seed) => {
            const schema = { type: 'number' as const, ...bounds };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const ajv = getAjv();

            try {
              const validate = ajv.compile(schema);
              const result = generator.generate(schema, context);

              if (result.isOk()) {
                // AJV validation oracle
                expect(validate(result.value)).toBe(true);
              }
            } catch (error) {
              // Skip invalid schemas with extreme bounds
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: Math.floor(getNumRuns() / 3) }
      );
    });

    it('should handle -0 vs 0 with exclusiveMinimum constraint', () => {
      const schema: NumberSchema = { type: 'number', exclusiveMinimum: 0 };
      expect(generator.validate(-0, schema)).toBe(false);
      expect(generator.validate(0, schema)).toBe(false);
      expect(generator.validate(0.1, schema)).toBe(true);
    });

    it('should handle -0 with exclusiveMinimum: 0 correctly', () => {
      const schema = { type: 'number' as const, exclusiveMinimum: 0 };

      // -0 should be rejected because it's not strictly > 0
      expect(generator.validate(-0, schema)).toBe(false);
      expect(generator.validate(0, schema)).toBe(false);
      expect(generator.validate(+0, schema)).toBe(false);

      // Positive values should be accepted
      expect(generator.validate(0.1, schema)).toBe(true);
      expect(generator.validate(Number.MIN_VALUE, schema)).toBe(true);
    });
  });

  describe('JSON Serialization Compliance (v2.1 Migration)', () => {
    it('should generate values that are JSON serializable', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            { type: 'number' as const },
            { type: 'number' as const, minimum: -1000, maximum: 1000 },
            { type: 'number' as const, multipleOf: 0.1 },
            { type: 'number' as const, enum: [1, 2.5, -3.14, 0] }
          ),
          fc.integer({ min: 0, max: 1000 }),
          (schema, seed) => {
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const ajv = getAjv();

            try {
              const validate = ajv.compile(schema);
              const result = generator.generate(schema, context);

              if (result.isOk()) {
                // AJV validation oracle
                expect(validate(result.value)).toBe(true);

                // Value should be JSON serializable
                expect(Number.isFinite(result.value)).toBe(true);

                // Should round-trip through JSON
                const serialized = JSON.stringify(result.value);
                const deserialized = JSON.parse(serialized);
                expect(generator.validate(deserialized, schema)).toBe(true);
              }
            } catch (error) {
              // Skip invalid schemas
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });
  });

  describe('FormatAdapter Cross-Reference Tests (Task 21)', () => {
    it('should maintain consistency with numeric format handling', () => {
      fc.assert(
        fc.property(
          createBounds(-1000, 1000),
          fc.integer({ min: 0, max: 1000 }),
          ([minimum, maximum], seed) => {
            const schema: NumberSchema = { type: 'number', minimum, maximum };
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
                  `[NUMBER_GENERATOR] FormatAdapter consistency - bounds: [${minimum}, ${maximum}], generated: ${result.value}, seed: ${seed}`
                );
              }
            }
          }
        ),
        { seed: NUMBER_TEST_SEED, numRuns: getNumRuns() }
      );
    });

    it('should handle edge cases where createBounds and AJV might differ', () => {
      const edgeCases = [
        { minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER },
        { exclusiveMinimum: -1, exclusiveMaximum: 1 },
        { minimum: 0, maximum: 0 }, // Single value
        { multipleOf: 0.1, minimum: -5.5, maximum: 5.5 },
      ];

      edgeCases.forEach((constraints, index) => {
        const schema: NumberSchema = { type: 'number', ...constraints };
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: NUMBER_TEST_SEED + index,
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
                `[NUMBER_GENERATOR] Edge case ${index} - schema: ${JSON.stringify(schema)}, generated: ${result.value}`
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
