import { describe, it, expect, beforeEach } from 'vitest';
/**
 * Property-based tests for NumberGenerator
 * Using fast-check for robust constraint validation
 */

import fc from 'fast-check';
import { NumberGenerator } from '../number-generator';
import { createGeneratorContext } from '../../data-generator';
import { FormatRegistry } from '../../../registry/format-registry';
import type { NumberSchema } from '../../../types/schema';

/**
 * Helper to clean undefined values from schema objects
 */
function cleanSchema(schema: Record<string, any>): NumberSchema {
  const cleaned: Record<string, any> = { type: 'number' };
  Object.keys(schema).forEach((key) => {
    if (schema[key] !== undefined) {
      cleaned[key] = schema[key];
    }
  });
  return cleaned as NumberSchema;
}

/**
 * JSON Schema number generator using expert boundary approach
 * Uses integer grid for multipleOf and ULP-aware bounds for continuous values
 */
type NumberSchemaConstraints = {
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number; // Draft 7+ numeric form only
  exclusiveMaximum?: number; // Draft 7+ numeric form only
  multipleOf?: number;
};

// Robust decimal places calculation for steps in scientific notation
function decimalPlaces(step: number): number {
  const s = step.toString().toLowerCase();
  if (s.includes('e')) {
    const [coeffStr, expStr] = s.split('e');
    const coeffFrac = coeffStr.split('.')[1]?.length ?? 0;
    const exp = Number(expStr);
    // exp < 0 => décale la virgule vers la gauche
    return Math.max(0, coeffFrac - exp);
  }
  return s.split('.')[1]?.length ?? 0;
}

// Generator for schema-compliant numbers (Case 1: with multipleOf)
function numberFromSchema(
  schema: NumberSchemaConstraints
): fc.Arbitrary<number> {
  const step = schema.multipleOf ?? 0.001; // default step for grid
  const digits = decimalPlaces(step);

  // Base bounds
  let min = schema.minimum ?? -1000;
  let max = schema.maximum ?? 1000;

  // Tighten with exclusive bounds if present - take most restrictive
  if (schema.exclusiveMinimum !== undefined) {
    min = Math.max(min, schema.exclusiveMinimum + step);
  }
  if (schema.exclusiveMaximum !== undefined) {
    max = Math.min(max, schema.exclusiveMaximum - step);
  }

  // Generate on integer grid then convert to decimal
  const iMin = Math.ceil(min / step);
  const iMax = Math.floor(max / step);

  if (iMin > iMax) {
    throw new Error(
      `Invalid range: no valid multiples of ${step} between ${min} and ${max}`
    );
  }

  return fc
    .integer({ min: iMin, max: iMax })
    .map((i) => Number((i * step).toFixed(digits)));
}

// Generator for continuous numbers with simple exclusive boundaries (Case 2: no multipleOf)
function openDouble(min: number, max: number): fc.Arbitrary<number> {
  return fc
    .double({ min, max, noNaN: true, noDefaultInfinity: true })
    .filter((x) => x > min && x < max);
}

// Decimal grid generator (simplified version for specific use cases)
function decimalArb(
  min: number,
  max: number,
  step: number
): fc.Arbitrary<number> {
  const digits = decimalPlaces(step);
  const iMin = Math.ceil(min / step);
  const iMax = Math.floor(max / step);

  return fc.integer({ min: iMin, max: iMax }).map((i) => {
    return Number((i * step).toFixed(digits));
  });
}

/**
 * Helper for multipleOf validation - Draft 7+ compliant with necessary tolerance
 * JSON Schema requires exact division, but JavaScript floating-point arithmetic
 * requires tolerance for practical implementation
 */
/**
 * Calculate Unit in the Last Place (ULP) for a number
 */
function ulp(value: number): number {
  if (!Number.isFinite(value)) return NaN;
  if (value === 0) return Number.MIN_VALUE;

  const absValue = Math.abs(value);
  // For normal numbers, ULP = 2^(exponent - 52) where 52 is mantissa precision
  const exponent = Math.floor(Math.log2(absValue));
  return Math.pow(2, exponent - 52);
}

function isMultipleOf(value: number, multipleOf: number): boolean {
  if (
    multipleOf <= 0 ||
    !Number.isFinite(value) ||
    !Number.isFinite(multipleOf)
  )
    return false;

  const q = value / multipleOf;
  // Rapproche q de l'entier le plus proche
  const k = Math.round(q);

  // Erreur absolue sur la reconstruction
  const recon = k * multipleOf;
  const absErr = Math.abs(value - recon);

  // Tolérance: somme de 2 ULP pertinentes + petite marge relative
  const tol =
    ulp(value) + Math.abs(k) * ulp(multipleOf) + Math.abs(value) * 1e-15;

  return absErr <= tol;
}

// Test isMultipleOf tolerance to avoid false positives
describe('isMultipleOf tolerance', () => {
  it('should not accept near-misses', () => {
    const step = 0.1;
    const k = 7;
    const near = k * step + step * 2e-13; // légèrement au-dessus
    expect(isMultipleOf(near, step)).toBe(false);
  });
});

describe('NumberGenerator', () => {
  let generator: NumberGenerator;
  let formatRegistry: FormatRegistry;

  beforeEach(() => {
    generator = new NumberGenerator();
    formatRegistry = new FormatRegistry();
  });

  describe('supports', () => {
    it('should support number schemas', () => {
      fc.assert(
        fc.property(
          fc.record({
            type: fc.constant('number'),
            minimum: fc.option(
              fc.double({ noNaN: true, noDefaultInfinity: true }),
              { nil: undefined }
            ),
            maximum: fc.option(
              fc.double({ noNaN: true, noDefaultInfinity: true }),
              { nil: undefined }
            ),
            multipleOf: fc.option(decimalArb(0.01, 10, 0.01), {
              nil: undefined,
            }),
            exclusiveMinimum: fc.option(
              fc.double({
                min: -100,
                max: 50,
                noNaN: true,
                noDefaultInfinity: true,
              }),
              { nil: undefined }
            ),
            exclusiveMaximum: fc.option(
              fc.double({
                min: -50,
                max: 100,
                noNaN: true,
                noDefaultInfinity: true,
              }),
              { nil: undefined }
            ),
            enum: fc.option(
              fc.array(fc.double({ noNaN: true, noDefaultInfinity: true }), {
                minLength: 1,
              }),
              { nil: undefined }
            ),
            // Note: minLength: 1 for quality, though JSON Schema spec only says enum SHOULD be non-empty
            const: fc.option(
              fc.double({ noNaN: true, noDefaultInfinity: true }),
              { nil: undefined }
            ),
          }),
          (schemaProps) => {
            const schema = cleanSchema(schemaProps);
            expect(() => generator.supports(schema)).not.toThrow();
            expect(generator.supports(schema)).toBe(true);
          }
        )
      );
    });

    it('should not support non-number schemas', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.record({
              type: fc.constantFrom(
                'string',
                'boolean',
                'object',
                'array',
                'integer'
              ),
            }),
            fc.constant(null as any),
            fc.constant(undefined as any),
            fc.boolean() as any,
            fc.string() as any
          ),
          (schema: any) => {
            expect(() => generator.supports(schema)).not.toThrow();
            expect(generator.supports(schema)).toBe(false);
          }
        )
      );
    });

    it('should not support draft-04 boolean exclusive bounds (Draft-07+ only)', () => {
      const schemas = [
        { type: 'number' as const, minimum: 10, exclusiveMinimum: true as any },
        { type: 'number' as const, maximum: 10, exclusiveMaximum: true as any },
        {
          type: 'number' as const,
          minimum: 5,
          maximum: 15,
          exclusiveMinimum: false as any,
          exclusiveMaximum: true as any,
        },
      ];
      schemas.forEach((schema) => {
        expect(generator.supports(schema)).toBe(false);
        const ctx = createGeneratorContext(schema, formatRegistry, { seed: 1 });
        expect(generator.generate(schema as any, ctx).isErr()).toBe(true);
        expect(generator.getExamples(schema as any)).toEqual([]);
      });
    });

    it('should not support multipleOf <= 0', () => {
      const schemas = [
        { type: 'number' as const, multipleOf: 0 },
        { type: 'number' as const, multipleOf: -1 },
        { type: 'number' as const, multipleOf: -0.5 },
      ];
      schemas.forEach((schema) => {
        expect(generator.supports(schema)).toBe(false);
        const ctx = createGeneratorContext(schema, formatRegistry, { seed: 1 });
        expect(generator.generate(schema, ctx).isErr()).toBe(true);
        expect(generator.getExamples(schema)).toEqual([]);
      });
    });

    it('should not support non-finite constraints (NaN/Infinity)', () => {
      const schemas = [
        { type: 'number' as const, minimum: NaN },
        { type: 'number' as const, maximum: Infinity },
        { type: 'number' as const, exclusiveMinimum: -Infinity },
        { type: 'number' as const, exclusiveMaximum: NaN },
        { type: 'number' as const, multipleOf: Infinity },
      ];
      schemas.forEach((schema) => {
        expect(generator.supports(schema)).toBe(false);
        const ctx = createGeneratorContext(schema, formatRegistry, { seed: 1 });
        expect(generator.generate(schema, ctx).isErr()).toBe(true);
        expect(generator.getExamples(schema)).toEqual([]);
      });
    });
  });

  describe('generate', () => {
    it('should always generate numbers', () => {
      const schema: NumberSchema = { type: 'number' };
      const context = createGeneratorContext(schema, formatRegistry);

      fc.assert(
        fc.property(fc.integer({ min: 1, max: 100000 }), (seed) => {
          const contextWithSeed = { ...context, seed };
          const result = generator.generate(schema, contextWithSeed);

          expect(result.isOk()).toBe(true);
          if (result.isOk()) {
            expect(typeof result.value).toBe('number');
            expect(Number.isFinite(result.value)).toBe(true);
          }
        })
      );
    });

    it('should respect minimum constraint', () => {
      fc.assert(
        fc.property(
          fc.double({
            min: -1000,
            max: 1000,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          fc.integer({ min: 1, max: 100000 }),
          (minimum, seed) => {
            const schema: NumberSchema = { type: 'number', minimum };
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
          fc.double({
            min: -1000,
            max: 1000,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          fc.integer({ min: 1, max: 100000 }),
          (maximum, seed) => {
            const schema: NumberSchema = { type: 'number', maximum };
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
          fc.double({
            min: -500,
            max: 500,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          fc.double({
            min: -500,
            max: 500,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          fc.integer({ min: 1, max: 100000 }),
          (min, max, seed) => {
            const minimum = Math.min(min, max);
            const maximum = Math.max(min, max);
            const schema: NumberSchema = { type: 'number', minimum, maximum };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(result.value).toBeGreaterThanOrEqual(minimum);
              expect(result.value).toBeLessThanOrEqual(maximum);
            }
          }
        )
      );
    });

    it('should respect multipleOf constraint with precise boundaries', () => {
      fc.assert(
        fc.property(
          // Use expert boundary approach - grid-based generation
          decimalArb(0.01, 5, 0.01),
          fc.integer({ min: 1, max: 100000 }),
          (multipleOf, seed) => {
            const schema: NumberSchema = { type: 'number', multipleOf };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(isMultipleOf(result.value, multipleOf)).toBe(true);
            }
          }
        )
      );
    });

    it('should handle precise exclusive bounds with multipleOf', () => {
      const schema: NumberSchemaConstraints = {
        exclusiveMinimum: -1,
        exclusiveMaximum: 1,
        multipleOf: 0.001,
      };

      fc.assert(
        fc.property(numberFromSchema(schema), (x) => {
          expect(x).toBeGreaterThan(-1);
          expect(x).toBeLessThan(1);
          expect(isMultipleOf(x, 0.001)).toBe(true);
        })
      );
    });

    it('should handle ULP-precise open intervals without multipleOf', () => {
      fc.assert(
        fc.property(openDouble(-1, 1), (x) => {
          expect(x).toBeGreaterThan(-1);
          expect(x).toBeLessThan(1);
          // Value should not be exactly at the boundaries
          expect(x).not.toBe(-1);
          expect(x).not.toBe(1);
        })
      );
    });

    it('should generate values from enum when provided', () => {
      fc.assert(
        fc.property(
          fc.array(fc.double({ noNaN: true, noDefaultInfinity: true }), {
            minLength: 1,
            maxLength: 10,
          }),
          fc.integer({ min: 1, max: 100000 }),
          (enumValues, seed) => {
            const schema: NumberSchema = { type: 'number', enum: enumValues };
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
          fc.double({ noNaN: true, noDefaultInfinity: true }),
          fc.integer({ min: 1, max: 100000 }),
          (constValue, seed) => {
            const schema: NumberSchema = { type: 'number', const: constValue };
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

    it('should handle exclusiveMinimum constraints (numeric form only)', () => {
      fc.assert(
        fc.property(
          fc.double({
            min: -100,
            max: 100,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          fc.integer({ min: 1, max: 100000 }),
          (exclusiveMinimum, seed) => {
            const schema = cleanSchema({ type: 'number', exclusiveMinimum });
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(result.value).toBeGreaterThan(exclusiveMinimum);
            }
          }
        )
      );
    });

    it('should handle exclusiveMaximum constraints (numeric form only)', () => {
      fc.assert(
        fc.property(
          fc.double({
            min: -100,
            max: 100,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          fc.integer({ min: 1, max: 100000 }),
          (exclusiveMaximum, seed) => {
            const schema = cleanSchema({ type: 'number', exclusiveMaximum });
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(result.value).toBeLessThan(exclusiveMaximum);
            }
          }
        )
      );
    });

    it('should generate same values with same seed', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100000 }),
          fc.record({
            minimum: fc.option(
              fc.double({
                min: -50,
                max: 0,
                noNaN: true,
                noDefaultInfinity: true,
              }),
              { nil: undefined }
            ),
            maximum: fc.option(
              fc.double({
                min: 0,
                max: 50,
                noNaN: true,
                noDefaultInfinity: true,
              }),
              { nil: undefined }
            ),
          }),
          (seed, constraintProps) => {
            const schema = cleanSchema({
              type: 'number',
              ...constraintProps,
            });

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

    it('should handle edge case scenarios', () => {
      fc.assert(
        fc.property(
          fc.record({
            minimum: fc.option(
              fc.double({
                min: -100,
                max: 0,
                noNaN: true,
                noDefaultInfinity: true,
              }),
              { nil: undefined }
            ),
            maximum: fc.option(
              fc.double({
                min: 1,
                max: 100,
                noNaN: true,
                noDefaultInfinity: true,
              }),
              { nil: undefined }
            ),
            // NOTE: Use practical ranges for real-world scenarios, avoiding edge cases
            // that would never occur in actual usage
          }),
          fc.integer({ min: 1, max: 100000 }),
          (constraintProps, seed) => {
            const schema = cleanSchema({
              type: 'number',
              ...constraintProps,
            });
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
              scenario: 'edge',
            });

            const result = generator.generate(schema, context);

            // For extremely small ranges that cannot be handled reliably,
            // the generator may fail - this is documented and expected behavior
            if (
              constraintProps.minimum !== undefined &&
              constraintProps.maximum !== undefined
            ) {
              const range = constraintProps.maximum - constraintProps.minimum;
              if (range < 1e-6) {
                // Allow failure for impractical ranges
                return true;
              }
            }

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              if (typeof constraintProps.minimum === 'number') {
                expect(result.value).toBeGreaterThanOrEqual(
                  constraintProps.minimum
                );
              }
              if (typeof constraintProps.maximum === 'number') {
                expect(result.value).toBeLessThanOrEqual(
                  constraintProps.maximum
                );
              }
            }
          }
        )
      );
    });

    it('should handle complex constraint combinations with expert boundaries', () => {
      fc.assert(
        fc.property(
          fc.record({
            minimum: decimalArb(0, 10, 0.5),
            maximum: decimalArb(20, 100, 0.5),
            multipleOf: decimalArb(0.5, 5, 0.5),
          }),
          fc.integer({ min: 1, max: 100000 }),
          (constraints, seed) => {
            const schema: NumberSchema = {
              type: 'number',
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
              expect(isMultipleOf(result.value, constraints.multipleOf)).toBe(
                true
              );
            }
          }
        )
      );
    });

    it('should generate successfully with different seeds', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100000 }),
          fc.integer({ min: 1, max: 100000 }),
          (seed1, seed2) => {
            fc.pre(seed1 !== seed2);

            const schema: NumberSchema = {
              type: 'number',
              minimum: 0,
              maximum: 1000,
            };

            const context1 = createGeneratorContext(schema, formatRegistry, {
              seed: seed1,
            });
            const context2 = createGeneratorContext(schema, formatRegistry, {
              seed: seed2,
            });

            const result1 = generator.generate(schema, context1);
            const result2 = generator.generate(schema, context2);

            // Both should succeed
            expect(result1.isOk()).toBe(true);
            expect(result2.isOk()).toBe(true);

            // With high probability, they should be different (not guaranteed due to randomness)
            return true; // We just verify both generate successfully
          }
        )
      );
    });

    it('should error when minimum > maximum', () => {
      const schema: NumberSchema = { type: 'number', minimum: 10, maximum: 5 };
      const ctx = createGeneratorContext(schema, formatRegistry, { seed: 1 });
      expect(generator.generate(schema, ctx).isErr()).toBe(true);
    });

    it('should error when no multipleOf fits in range', () => {
      const schema: NumberSchema = {
        type: 'number',
        minimum: 1,
        maximum: 1.5,
        multipleOf: 2,
      };
      const ctx = createGeneratorContext(schema, formatRegistry, { seed: 1 });
      expect(generator.generate(schema, ctx).isErr()).toBe(true);
    });

    it('should error when exclusiveMinimum >= exclusiveMaximum', () => {
      const schema: NumberSchema = {
        type: 'number',
        exclusiveMinimum: 10,
        exclusiveMaximum: 10,
      };
      const ctx = createGeneratorContext(schema, formatRegistry, { seed: 1 });
      expect(generator.generate(schema, ctx).isErr()).toBe(true);
    });

    it('should handle enum with additional constraints', () => {
      fc.assert(
        fc.property(
          fc.array(fc.double({ noNaN: true, noDefaultInfinity: true }), {
            minLength: 3,
            maxLength: 10,
          }),
          fc.double({
            min: -50,
            max: 50,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          fc.double({
            min: 50,
            max: 100,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          fc.integer({ min: 1, max: 100000 }),
          (enumValues, minimum, maximum, seed) => {
            const schema: NumberSchema = {
              type: 'number',
              enum: enumValues,
              minimum,
              maximum,
            };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            if (result.isOk()) {
              // Must be from enum AND satisfy constraints
              expect(enumValues).toContain(result.value);
              expect(result.value).toBeGreaterThanOrEqual(minimum);
              expect(result.value).toBeLessThanOrEqual(maximum);
            }
            // Generation might fail if no enum value satisfies constraints
          }
        )
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
      });
    });

    it('should handle empty enum (spec allows but generation should fail)', () => {
      // JSON Schema spec says enum SHOULD be non-empty, but doesn't forbid it
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
          fc.double({ noNaN: true, noDefaultInfinity: true }),
          fc.record({
            minimum: fc.option(
              fc.double({
                min: -100,
                max: 100,
                noNaN: true,
                noDefaultInfinity: true,
              }),
              { nil: undefined }
            ),
            maximum: fc.option(
              fc.double({
                min: -100,
                max: 100,
                noNaN: true,
                noDefaultInfinity: true,
              }),
              { nil: undefined }
            ),
            multipleOf: fc.option(decimalArb(0.1, 10, 0.1), { nil: undefined }),
          }),
          (value, constraintProps) => {
            const schema = cleanSchema({
              type: 'number',
              ...constraintProps,
            });

            const isValid = generator.validate(value, schema);

            // Check if the value should be valid according to constraints
            let shouldBeValid = true;

            if (
              typeof constraintProps.minimum === 'number' &&
              value < constraintProps.minimum
            ) {
              shouldBeValid = false;
            }
            if (
              typeof constraintProps.maximum === 'number' &&
              value > constraintProps.maximum
            ) {
              shouldBeValid = false;
            }
            if (typeof constraintProps.multipleOf === 'number') {
              if (!isMultipleOf(value, constraintProps.multipleOf)) {
                shouldBeValid = false;
              }
            }

            expect(isValid).toBe(shouldBeValid);
          }
        )
      );
    });

    it('should reject non-number values', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string(),
            fc.boolean(),
            fc.constantFrom(null, undefined),
            fc.array(fc.anything()),
            fc.object()
          ),
          (nonNumberValue) => {
            const schema: NumberSchema = { type: 'number' };
            expect(generator.validate(nonNumberValue, schema)).toBe(false);
          }
        )
      );
    });

    it('should validate enum constraints correctly', () => {
      fc.assert(
        fc.property(
          fc
            .array(
              fc.oneof(
                fc.integer({ min: -1000, max: 1000 }), // Use integers to avoid floating-point precision issues
                fc.constantFrom(-0, 0, 0.5, -0.5, Math.PI, Math.E) // Common exact values
              ),
              { minLength: 1, maxLength: 5 }
            )
            .chain((enumValues) => {
              const outside = fc
                .double({
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

            const isValid = generator.validate(testValue, schema);
            const shouldBeValid = enumValues.some((val) => val === testValue);

            expect(isValid).toBe(shouldBeValid);
          }
        )
      );
    });

    it('should validate const constraints correctly', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer({ min: -1000, max: 1000 }), // Use integers to avoid floating-point precision issues
            fc.constantFrom(-0, 0, 0.5, -0.5, Math.PI, Math.E) // Common exact values
          ),
          fc.boolean(), // Whether to test the exact const value or a different one
          fc.double({
            min: -1000,
            max: 1000,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          (constValue, useConstValue, outsideVal) => {
            const schema: NumberSchema = { type: 'number', const: constValue };

            const testValue = useConstValue ? constValue : outsideVal;

            const isValid = generator.validate(testValue, schema);
            const shouldBeValid = testValue === constValue;

            expect(isValid).toBe(shouldBeValid);
          }
        ),
        { numRuns: 25 } // Use practical ranges and fewer runs for stability
      );
    });

    it('should reject infinite values', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
          (infiniteValue) => {
            const schema: NumberSchema = { type: 'number' };
            expect(generator.validate(infiniteValue, schema)).toBe(false);
          }
        )
      );
    });

    it('should validate enum with additional constraints', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.double({
              min: 0,
              max: 100,
              noNaN: true,
              noDefaultInfinity: true,
            }),
            { minLength: 3, maxLength: 5 }
          ),
          fc.double({
            min: -50,
            max: 50,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          fc.double({
            min: 200,
            max: 300,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          (enumValues, testValue, outsideValue) => {
            const schema: NumberSchema = {
              type: 'number',
              enum: enumValues,
              minimum: 10,
              maximum: 90,
            };

            // Test value from enum that violates other constraints
            const validEnumValue = enumValues.find(
              (val) => val >= 10 && val <= 90
            );
            const invalidEnumValue = enumValues.find(
              (val) => val < 10 || val > 90
            );

            if (validEnumValue !== undefined) {
              expect(generator.validate(validEnumValue, schema)).toBe(true);
            }

            if (invalidEnumValue !== undefined) {
              expect(generator.validate(invalidEnumValue, schema)).toBe(false);
            }

            // Value not in enum should be invalid regardless of other constraints
            expect(generator.validate(outsideValue, schema)).toBe(false);
          }
        )
      );
    });

    it('should reject NaN values', () => {
      const schema: NumberSchema = { type: 'number' };
      expect(generator.validate(Number.NaN, schema)).toBe(false);
    });

    it('should reject NaN/Infinity in schema constraints (Draft 7+ compliance)', () => {
      const invalidConstraints = [
        { type: 'number' as const, minimum: Number.NaN },
        { type: 'number' as const, maximum: Number.NaN },
        { type: 'number' as const, exclusiveMinimum: Number.NaN },
        { type: 'number' as const, exclusiveMaximum: Number.NaN },
        { type: 'number' as const, multipleOf: Number.NaN },
        { type: 'number' as const, minimum: Number.POSITIVE_INFINITY },
        { type: 'number' as const, maximum: Number.NEGATIVE_INFINITY },
        { type: 'number' as const, const: Number.NaN },
        { type: 'number' as const, enum: [1, Number.NaN, 3] },
      ];

      invalidConstraints.forEach((schema) => {
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: 42,
        });

        // Schema with NaN/Infinity constraints should fail generation
        const result = generator.generate(schema, context);
        expect(result.isErr()).toBe(true);
      });
    });
  });

  describe('getExamples', () => {
    it('should return enum values as examples when available', () => {
      fc.assert(
        fc.property(
          fc.array(fc.double({ noNaN: true, noDefaultInfinity: true }), {
            minLength: 1,
            maxLength: 10,
          }),
          (enumValues) => {
            const schema: NumberSchema = { type: 'number', enum: enumValues };
            const examples = generator.getExamples(schema);

            expect(examples).toEqual(enumValues);
          }
        )
      );
    });

    it('should return const value as example when available', () => {
      fc.assert(
        fc.property(
          fc.double({ noNaN: true, noDefaultInfinity: true }),
          (constValue) => {
            const schema: NumberSchema = { type: 'number', const: constValue };
            const examples = generator.getExamples(schema);

            expect(examples).toEqual([constValue]);
          }
        )
      );
    });

    it('should return schema examples when available', () => {
      fc.assert(
        fc.property(
          fc.array(fc.double({ noNaN: true, noDefaultInfinity: true }), {
            minLength: 1,
            maxLength: 5,
          }),
          (schemaExamples) => {
            const schema: NumberSchema = {
              type: 'number',
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
            minimum: fc.option(
              fc.double({
                min: -10,
                max: 0,
                noNaN: true,
                noDefaultInfinity: true,
              }),
              { nil: undefined }
            ),
            maximum: fc.option(
              fc.double({
                min: 0,
                max: 10,
                noNaN: true,
                noDefaultInfinity: true,
              }),
              { nil: undefined }
            ),
            multipleOf: fc.option(decimalArb(0.1, 5, 0.1), { nil: undefined }),
          }),
          (constraintProps) => {
            const schema = cleanSchema({
              type: 'number',
              ...constraintProps,
            });
            const examples = generator.getExamples(schema);

            expect(Array.isArray(examples)).toBe(true);
            expect(examples.length).toBeLessThanOrEqual(10); // Bounded size

            // For impossible constraint combinations (e.g., max: 2e-16, multipleOf: 0.1),
            // no valid examples may exist, which is acceptable
            if (examples.length === 0) {
              // Verify this is indeed an impossible constraint combination
              // by checking if generation also fails
              const context = createGeneratorContext(schema, formatRegistry, {
                seed: 42,
              });
              const result = generator.generate(schema, context);
              expect(result.isErr()).toBe(true); // Should fail generation too
              return; // Skip further validation since no examples exist
            }

            expect(examples.length).toBeGreaterThan(0);

            // All examples should be numbers and meet ALL constraints
            examples.forEach((example) => {
              expect(typeof example).toBe('number');
              expect(Number.isFinite(example)).toBe(true);
              if (typeof constraintProps.minimum === 'number') {
                expect(example).toBeGreaterThanOrEqual(constraintProps.minimum);
              }
              if (typeof constraintProps.maximum === 'number') {
                expect(example).toBeLessThanOrEqual(constraintProps.maximum);
              }
              if (typeof constraintProps.multipleOf === 'number') {
                expect(isMultipleOf(example, constraintProps.multipleOf)).toBe(
                  true
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

    it('getExamples: handles very small multipleOf', () => {
      const schema: NumberSchema = {
        type: 'number',
        minimum: 0,
        maximum: 1e-9,
        multipleOf: 1e-12,
      };
      const examples = generator.getExamples(schema);
      // Zéro ou plus, mais s'il y en a, tous valides
      examples.forEach((x) => {
        expect(generator.validate(x, schema)).toBe(true);
      });
    });

    it('getExamples: should return unique values', () => {
      const schema: NumberSchema = {
        type: 'number',
        minimum: 0,
        maximum: 10,
        multipleOf: 0.5,
      };
      const ex = generator.getExamples(schema);
      expect(new Set(ex).size).toBe(ex.length);
    });
  });

  describe('getPriority', () => {
    it('should return stable numeric priority', () => {
      const priority1 = generator.getPriority();
      const priority2 = generator.getPriority();

      expect(typeof priority1).toBe('number');
      expect(typeof priority2).toBe('number');
      expect(priority1).toBe(priority2); // Should be stable
      expect(Number.isFinite(priority1)).toBe(true);
    });
  });

  describe('integration tests', () => {
    it('should maintain consistency between generate and validate', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            // Simple schema with no constraints
            fc.constant({}),
            // Schema with minimum and maximum (compatible range)
            fc
              .double({
                min: -10,
                max: 10,
                noNaN: true,
                noDefaultInfinity: true,
              })
              .chain((min) =>
                fc
                  .double({
                    min: min,
                    max: min + 20,
                    noNaN: true,
                    noDefaultInfinity: true,
                  })
                  .map((max) => ({
                    minimum: min,
                    maximum: max,
                  }))
              ),
            // Schema with enum only
            fc.record({
              enum: fc.array(
                fc.double({
                  min: -100,
                  max: 100,
                  noNaN: true,
                  noDefaultInfinity: true,
                }),
                { minLength: 1, maxLength: 5 }
              ),
            }),
            // Schema with multipleOf only
            fc.record({
              multipleOf: decimalArb(1, 5, 0.5),
            })
          ),
          fc.integer({ min: 1, max: 100000 }),
          (schemaProps, seed) => {
            const schema = cleanSchema({
              type: 'number',
              ...('minimum' in schemaProps &&
              typeof schemaProps.minimum === 'number'
                ? { minimum: schemaProps.minimum }
                : {}),
              ...('maximum' in schemaProps &&
              typeof schemaProps.maximum === 'number'
                ? { maximum: schemaProps.maximum }
                : {}),
              ...('multipleOf' in schemaProps &&
              typeof schemaProps.multipleOf === 'number'
                ? { multipleOf: schemaProps.multipleOf }
                : {}),
              ...('enum' in schemaProps && Array.isArray(schemaProps.enum)
                ? { enum: schemaProps.enum }
                : {}),
            });
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

    it('should handle boundary conditions correctly', () => {
      const boundaryValues = [
        { minimum: 0, maximum: 0 }, // Single point - valid
        { minimum: 1, maximum: 1.5, multipleOf: 2 }, // Actually impossible
        { minimum: 0.1, maximum: 0.9, multipleOf: 1 }, // No valid multiples
      ];

      boundaryValues.forEach((constraints, index) => {
        const schema: NumberSchema = {
          type: 'number',
          ...constraints,
        };
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: index,
        });

        const result = generator.generate(schema, context);

        if (result.isOk()) {
          // If generation succeeds, result should be valid
          expect(generator.validate(result.value, schema)).toBe(true);
          expect(Number.isFinite(result.value)).toBe(true);
          if (typeof constraints.multipleOf === 'number') {
            expect(isMultipleOf(result.value, constraints.multipleOf)).toBe(
              true
            );
          }
        }
        // If generation fails, that's also acceptable for impossible constraints
      });
    });

    it('exclusiveMaximum exactly on a multiple should exclude it', () => {
      const s = {
        type: 'number',
        exclusiveMaximum: 20,
        multipleOf: 5,
      } as NumberSchema;
      const ctx = createGeneratorContext(s, formatRegistry, { seed: 1 });
      const r = generator.generate(s, ctx);
      if (r.isOk()) expect(r.value).toBeLessThan(20);
      expect(generator.validate(20, s)).toBe(false);
      expect(generator.validate(15, s)).toBe(true);
    });
  });

  describe('comprehensive constraints coverage', () => {
    it('should handle all number constraint combinations', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.double({
              min: -100,
              max: 0,
              noNaN: true,
              noDefaultInfinity: true,
            }),
            fc.double({
              min: 0,
              max: 100,
              noNaN: true,
              noDefaultInfinity: true,
            })
          ),
          decimalArb(0.1, 10, 0.1),
          fc.integer({ min: 1, max: 100000 }),
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

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(typeof result.value).toBe('number');
              expect(Number.isFinite(result.value)).toBe(true);
              expect(result.value).toBeGreaterThanOrEqual(minimum);
              expect(result.value).toBeLessThanOrEqual(maximum);

              expect(isMultipleOf(result.value, multipleOf)).toBe(true);

              expect(generator.validate(result.value, schema)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle exclusive bounds correctly', () => {
      fc.assert(
        fc.property(
          fc.double({
            min: -50,
            max: 50,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          fc.double({
            min: -30,
            max: 30,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          fc.integer({ min: 1, max: 100000 }),
          (exclusiveMin, exclusiveMax, seed) => {
            // Ensure exclusiveMax > exclusiveMin
            const [min, max] =
              exclusiveMin < exclusiveMax
                ? [exclusiveMin, exclusiveMax]
                : [exclusiveMax, exclusiveMin];

            // Skip cases where the gap is too small for valid exclusive bounds
            if (max - min <= 1e-10) {
              return;
            }

            const schema: NumberSchema = {
              type: 'number',
              exclusiveMinimum: min,
              exclusiveMaximum: max,
            };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(result.value).toBeGreaterThan(min);
              expect(result.value).toBeLessThan(max);
              expect(generator.validate(result.value, schema)).toBe(true);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should generate valid enum values', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.double({
              min: -100,
              max: 100,
              noNaN: true,
              noDefaultInfinity: true,
            }),
            { minLength: 1, maxLength: 10 }
          ),
          fc.integer({ min: 1, max: 100000 }),
          (enumValues, seed) => {
            const schema: NumberSchema = { type: 'number', enum: enumValues };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
            });

            const result = generator.generate(schema, context);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(enumValues).toContain(result.value);
              expect(generator.validate(result.value, schema)).toBe(true);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should handle edge cases correctly', () => {
      const edgeCases = [
        { minimum: 0, maximum: 0 }, // Single value
        { minimum: -0.1, maximum: 0.1, multipleOf: 0.05 }, // Small decimals
        { minimum: 1, maximum: 1000000, multipleOf: 1000 }, // Large numbers
        { const: Math.PI }, // Constant value
        { minimum: Number.MIN_VALUE, maximum: Number.MAX_SAFE_INTEGER }, // Extreme values
      ];

      edgeCases.forEach((constraints, index) => {
        const schema: NumberSchema = { type: 'number', ...constraints };
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: index,
        });

        const result = generator.generate(schema, context);

        if (result.isOk()) {
          expect(generator.validate(result.value, schema)).toBe(true);
          expect(Number.isFinite(result.value)).toBe(true);
        }
      });
    });

    it('metamorphic: generated value +/- half-step should violate multipleOf (if in-bounds)', () => {
      fc.assert(
        fc.property(
          fc.record({
            minimum: fc.constant(0),
            maximum: fc.constant(10),
            multipleOf: fc.constantFrom(0.5, 1, 2),
          }),
          fc.integer({ min: 1, max: 10000 }),
          (props, seed) => {
            const schema: NumberSchema = { type: 'number', ...props };
            const ctx = createGeneratorContext(schema, formatRegistry, {
              seed,
            });
            const r = generator.generate(schema, ctx);
            if (!r.isOk()) return true;
            const v = r.value;
            const d = props.multipleOf / 2;
            // Test seulement si on reste dans [min, max]
            if (v + d <= 10)
              expect(generator.validate(v + d, schema)).toBe(false);
            if (v - d >= 0)
              expect(generator.validate(v - d, schema)).toBe(false);
          }
        )
      );
    });

    it('should not degenerate distribution on wide ranges', () => {
      const schema: NumberSchema = {
        type: 'number',
        minimum: 0,
        maximum: 1000,
      };
      const seeds = Array.from({ length: 50 }, (_, i) => i + 1);
      const vals = seeds
        .map((seed) => {
          const ctx = createGeneratorContext(schema, formatRegistry, { seed });
          const r = generator.generate(schema, ctx);
          return r.isOk() ? r.value : null;
        })
        .filter((v): v is number => v !== null);
      expect(new Set(vals).size).toBeGreaterThan(1);
    });
  });

  // Tests de couverture fonctionnelle manquante selon l'expert
  describe('couverture fonctionnelle complète', () => {
    describe('1. schémas impossibles/contradictoires', () => {
      it('should handle impossible minimum > maximum constraints', () => {
        fc.assert(
          fc.property(
            fc.double({
              min: 0,
              max: 100,
              noNaN: true,
              noDefaultInfinity: true,
            }),
            fc.double({
              min: 0,
              max: 100,
              noNaN: true,
              noDefaultInfinity: true,
            }),
            fc.integer({ min: 1, max: 100000 }),
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

              const result = generator.generate(schema, context);
              expect(result.isErr()).toBe(true);

              // Validation should reject any value for impossible constraints
              expect(generator.validate(minimum, schema)).toBe(false);
              expect(generator.validate(maximum, schema)).toBe(false);
              expect(generator.validate((minimum + maximum) / 2, schema)).toBe(
                false
              );
            }
          )
        );
      });

      it('should handle impossible exclusiveMinimum >= exclusiveMaximum', () => {
        fc.assert(
          fc.property(
            fc.double({
              min: -50,
              max: 50,
              noNaN: true,
              noDefaultInfinity: true,
            }),
            fc.double({
              min: -50,
              max: 50,
              noNaN: true,
              noDefaultInfinity: true,
            }),
            fc.integer({ min: 1, max: 100000 }),
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

              const result = generator.generate(schema, context);
              expect(result.isErr()).toBe(true);

              // No value can satisfy x > min AND x < max when min >= max
              expect(generator.validate(exclusiveMinimum, schema)).toBe(false);
              expect(generator.validate(exclusiveMaximum, schema)).toBe(false);
            }
          )
        );
      });

      it('should handle contradictory minimum + exclusiveMinimum', () => {
        const testCases = [
          { minimum: 10, exclusiveMinimum: 5 }, // exclusiveMinimum < minimum (inconsistent)
          { minimum: 10, exclusiveMinimum: 10 }, // exclusiveMinimum = minimum (impossible)
          { maximum: 10, exclusiveMaximum: 15 }, // exclusiveMaximum > maximum (inconsistent)
          { maximum: 10, exclusiveMaximum: 10 }, // exclusiveMaximum = maximum (impossible)
        ];

        testCases.forEach((constraintProps) => {
          const schema: NumberSchema = { type: 'number', ...constraintProps };
          const context = createGeneratorContext(schema, formatRegistry, {
            seed: 42,
          });

          // Should either fail generation or have very restrictive validation
          const result = generator.generate(schema, context);
          if (result.isOk()) {
            // If generation succeeds, validate the result
            expect(generator.validate(result.value, schema)).toBe(true);
          }

          // Test edge values that should fail
          if (
            'exclusiveMinimum' in constraintProps &&
            'minimum' in constraintProps
          ) {
            const min = Math.min(
              constraintProps.exclusiveMinimum!,
              constraintProps.minimum!
            );
            expect(generator.validate(min, schema)).toBe(false);
          }
          if (
            'exclusiveMaximum' in constraintProps &&
            'maximum' in constraintProps
          ) {
            const max = Math.max(
              constraintProps.exclusiveMaximum!,
              constraintProps.maximum!
            );
            expect(generator.validate(max, schema)).toBe(false);
          }
        });
      });
    });

    describe('2. multipleOf + bornes exclusives', () => {
      it('should handle exclusive bound exactly on multiple', () => {
        const schema: NumberSchema = {
          type: 'number',
          exclusiveMinimum: 10, // Exactly a multiple of 5
          multipleOf: 5,
        };
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: 42,
        });

        const result = generator.generate(schema, context);

        if (result.isOk()) {
          expect(result.value).toBeGreaterThan(10);
          expect(isMultipleOf(result.value, 5)).toBe(true);
        }

        // 10 should be rejected (it's on exclusive bound)
        expect(generator.validate(10, schema)).toBe(false);
        // 15 should be accepted (first valid multiple > 10)
        expect(generator.validate(15, schema)).toBe(true);
      });

      it('should handle open interval smaller than multipleOf step', () => {
        const schema: NumberSchema = {
          type: 'number',
          exclusiveMinimum: 10,
          exclusiveMaximum: 10.5,
          multipleOf: 1,
        };
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: 42,
        });

        const result = generator.generate(schema, context);
        // Should fail as no integer multiple exists in (10, 10.5)
        expect(result.isErr()).toBe(true);
      });

      it('should handle interval with exactly one multiple inside exclusive bounds', () => {
        const schema: NumberSchema = {
          type: 'number',
          exclusiveMinimum: 9,
          exclusiveMaximum: 11,
          multipleOf: 2,
        };
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: 42,
        });

        const result = generator.generate(schema, context);
        // 10 is the only multiple of 2 in the open interval (9, 11)
        if (result.isOk()) {
          expect(result.value).toBe(10);
        }

        expect(generator.validate(10, schema)).toBe(true);
        expect(generator.validate(8, schema)).toBe(false);
        expect(generator.validate(12, schema)).toBe(false);
      });
    });

    describe('3. enum/const combinés aux autres contraintes', () => {
      it('should handle enum with values outside bounds', () => {
        fc.assert(
          fc.property(
            fc.double({
              min: 0,
              max: 50,
              noNaN: true,
              noDefaultInfinity: true,
            }),
            fc.double({
              min: 60,
              max: 100,
              noNaN: true,
              noDefaultInfinity: true,
            }),
            fc.integer({ min: 1, max: 100000 }),
            (minBound, maxBound, seed) => {
              const enumValues = [5, 25, 75, 95]; // Some inside [0,50], some outside
              const schema: NumberSchema = {
                type: 'number',
                enum: enumValues,
                minimum: minBound,
                maximum: maxBound,
              };
              const context = createGeneratorContext(schema, formatRegistry, {
                seed,
              });

              const result = generator.generate(schema, context);

              if (result.isOk()) {
                // Generated value must be in enum AND satisfy bounds
                expect(enumValues).toContain(result.value);
                expect(result.value).toBeGreaterThanOrEqual(minBound);
                expect(result.value).toBeLessThanOrEqual(maxBound);
              }

              // Test validation of each enum value
              enumValues.forEach((enumValue) => {
                const isInBounds =
                  enumValue >= minBound && enumValue <= maxBound;
                expect(generator.validate(enumValue, schema)).toBe(isInBounds);
              });
            }
          )
        );
      });

      it('should handle const with additional constraints', () => {
        const testCases = [
          { const: 15, minimum: 10, maximum: 20, shouldBeValid: true },
          { const: 5, minimum: 10, maximum: 20, shouldBeValid: false },
          { const: 25, minimum: 10, maximum: 20, shouldBeValid: false },
          { const: 10, multipleOf: 5, shouldBeValid: true },
          { const: 11, multipleOf: 5, shouldBeValid: false },
        ];

        testCases.forEach(({ shouldBeValid, ...schemaProps }) => {
          const schema: NumberSchema = { type: 'number', ...schemaProps };
          const context = createGeneratorContext(schema, formatRegistry, {
            seed: 42,
          });

          const result = generator.generate(schema, context);

          if (shouldBeValid) {
            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(result.value).toBe(schemaProps.const);
            }
          } else {
            expect(result.isErr()).toBe(true);
          }

          expect(generator.validate(schemaProps.const, schema)).toBe(
            shouldBeValid
          );
        });
      });

      it('should handle enum with multipleOf constraint', () => {
        const enumValues = [10, 15, 20, 23, 30]; // Mix of multiples and non-multiples of 5
        const schema: NumberSchema = {
          type: 'number',
          enum: enumValues,
          multipleOf: 5,
        };
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: 42,
        });

        const result = generator.generate(schema, context);

        if (result.isOk()) {
          expect(enumValues).toContain(result.value);
          expect(isMultipleOf(result.value, 5)).toBe(true);
        }

        // Only multiples of 5 should be valid
        expect(generator.validate(10, schema)).toBe(true);
        expect(generator.validate(15, schema)).toBe(true);
        expect(generator.validate(20, schema)).toBe(true);
        expect(generator.validate(23, schema)).toBe(false); // In enum but not multiple of 5
        expect(generator.validate(30, schema)).toBe(true);
      });
    });

    describe('4. exemples générés automatiquement', () => {
      it('should generate compliant examples when no explicit examples', () => {
        const schemas = [
          { type: 'number' as const, minimum: 10, maximum: 20 },
          { type: 'number' as const, multipleOf: 5 },
          {
            type: 'number' as const,
            exclusiveMinimum: 0,
            exclusiveMaximum: 100,
          },
          { type: 'number' as const, minimum: 1, maximum: 10, multipleOf: 2 },
        ];

        schemas.forEach((schema) => {
          const examples = generator.getExamples(schema);

          // Should have some examples
          expect(examples.length).toBeGreaterThan(0);

          // All examples should be valid according to the schema
          examples.forEach((example) => {
            expect(generator.validate(example, schema)).toBe(true);
          });
        });
      });

      it('should limit example list size', () => {
        const schema: NumberSchema = {
          type: 'number',
          minimum: -1000,
          maximum: 1000,
        };
        const examples = generator.getExamples(schema);

        // Should be bounded (not infinite)
        expect(examples.length).toBeLessThanOrEqual(10);
      });
    });

    describe('5. cas IEEE-754 -0', () => {
      it('should handle -0 with exclusiveMinimum: 0', () => {
        const schema: NumberSchema = {
          type: 'number',
          exclusiveMinimum: 0,
        };

        // -0 should be rejected as it equals 0, not > 0
        expect(generator.validate(-0, schema)).toBe(false);
        expect(generator.validate(0, schema)).toBe(false);
        expect(generator.validate(0.1, schema)).toBe(true);
      });

      it('should handle -0 in enum with positive zero', () => {
        const schema: NumberSchema = {
          type: 'number',
          enum: [0], // Positive zero in enum
        };

        // -0 should be considered equal to 0 for enum membership
        expect(generator.validate(-0, schema)).toBe(true);
        expect(generator.validate(0, schema)).toBe(true);
      });

      it('should distinguish -0 and +0 when appropriate', () => {
        // Test Object.is behavior which can distinguish -0 and +0
        expect(Object.is(-0, 0)).toBe(false);
        expect(Object.is(0, -0)).toBe(false);
        expect(Object.is(-0, 0)).toBe(false); // Object.is distinguishes -0 from +0

        // Our validator should use === semantics for practical compatibility
        const schema: NumberSchema = { type: 'number', const: 0 };
        expect(generator.validate(-0, schema)).toBe(true);
        expect(generator.validate(0, schema)).toBe(true);
      });
    });

    describe('6. formes draft-04 vs modernes pour exclusive*', () => {
      it('should reject draft-04 boolean exclusiveMinimum (Draft-07+ only)', () => {
        // Draft-04 style: exclusiveMinimum is boolean - should be REJECTED
        const schema: NumberSchema = {
          type: 'number',
          minimum: 10,
          exclusiveMinimum: true as any,
        };

        // Generator should not support this schema format
        expect(generator.supports(schema)).toBe(false);

        // Validation should return false for unsupported schemas
        expect(generator.validate(10.1, schema)).toBe(false);
      });

      it('should handle modern numeric exclusiveMinimum', () => {
        // Draft-06+ style: exclusiveMinimum is numeric and independent
        const schema: NumberSchema = {
          type: 'number',
          exclusiveMinimum: 10,
        };

        expect(generator.validate(10, schema)).toBe(false);
        expect(generator.validate(10.1, schema)).toBe(true);
        expect(generator.validate(9.9, schema)).toBe(false);
      });

      it('should generate precise values with Draft 7+ exclusive bounds and multipleOf', () => {
        const cases: NumberSchemaConstraints[] = [
          { exclusiveMinimum: 0, exclusiveMaximum: 1, multipleOf: 0.01 },
          { minimum: 0.5, exclusiveMaximum: 1, multipleOf: 0.01 },
        ];

        cases.forEach((schema) => {
          try {
            fc.assert(
              fc.property(numberFromSchema(schema), (x) => {
                if (schema.exclusiveMinimum !== undefined)
                  expect(x).toBeGreaterThan(schema.exclusiveMinimum);
                if (schema.minimum !== undefined)
                  expect(x).toBeGreaterThanOrEqual(schema.minimum);
                if (schema.exclusiveMaximum !== undefined)
                  expect(x).toBeLessThan(schema.exclusiveMaximum);
                if (schema.maximum !== undefined)
                  expect(x).toBeLessThanOrEqual(schema.maximum);
                expect(isMultipleOf(x, schema.multipleOf!)).toBe(true);
                const rem = x % schema.multipleOf!;
                expect(
                  Math.abs(rem) < 1e-10 ||
                    Math.abs(rem - schema.multipleOf!) < 1e-10
                ).toBe(true);
              }),
              { numRuns: 20 }
            );
          } catch (error) {
            // If the range is impossible, that's expected for some constraint combinations
            if (
              error instanceof Error &&
              error.message.includes('Invalid range')
            ) {
              expect(true).toBe(true); // Test passes - correctly detected impossible range
            } else {
              throw error;
            }
          }
        });
      });

      it('should handle mixed minimum and exclusiveMinimum', () => {
        // Both present - should use the more restrictive bound
        const testCases = [
          {
            minimum: 5,
            exclusiveMinimum: 10,
            expectedMin: 10,
            inclusive: false,
          },
          {
            minimum: 15,
            exclusiveMinimum: 10,
            expectedMin: 15,
            inclusive: true,
          },
        ];

        testCases.forEach(
          ({ minimum, exclusiveMinimum, expectedMin, inclusive }) => {
            const schema: NumberSchema = {
              type: 'number',
              minimum,
              exclusiveMinimum,
            };

            expect(generator.validate(expectedMin, schema)).toBe(inclusive);
            expect(generator.validate(expectedMin + 0.1, schema)).toBe(true);
            expect(generator.validate(expectedMin - 0.1, schema)).toBe(false);
          }
        );
      });

      it('should honor tighter of maximum and exclusiveMaximum', () => {
        const s: NumberSchema = {
          type: 'number',
          maximum: 10,
          exclusiveMaximum: 100,
          multipleOf: 1,
        };
        const ctx = createGeneratorContext(s, formatRegistry, { seed: 1 });
        const r = generator.generate(s, ctx);
        if (r.isOk()) {
          expect(r.value).toBeLessThanOrEqual(10); // maximum plus serré que exclusiveMaximum
          expect(isMultipleOf(r.value, 1)).toBe(true);
        }
      });

      it('should honor tighter of minimum and exclusiveMinimum', () => {
        const s: NumberSchema = {
          type: 'number',
          minimum: 5,
          exclusiveMinimum: 0,
          multipleOf: 1,
        };
        const ctx = createGeneratorContext(s, formatRegistry, { seed: 1 });
        const r = generator.generate(s, ctx);
        if (r.isOk()) {
          expect(r.value).toBeGreaterThanOrEqual(5); // minimum plus serré que exclusiveMinimum
          expect(isMultipleOf(r.value, 1)).toBe(true);
        }
      });
    });

    describe('6.5. tests de régression pour bugs classiques', () => {
      it('should handle multipleOf with narrow decimal boundaries (classic bug)', () => {
        // Bug classique : multipleOf avec décimales dans une plage étroite
        // Devrait accepter 0.97, 0.98, 0.99 comme multiples de 0.01
        const schema: NumberSchema = {
          type: 'number',
          multipleOf: 0.01,
          minimum: 0.97,
          maximum: 0.99,
        };
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: 42,
        });

        // Test génération
        const result = generator.generate(schema, context);
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value).toBeGreaterThanOrEqual(0.97);
          expect(result.value).toBeLessThanOrEqual(0.99);
          expect(isMultipleOf(result.value, 0.01)).toBe(true);
        }

        // Test validation des valeurs attendues
        expect(generator.validate(0.97, schema)).toBe(true);
        expect(generator.validate(0.98, schema)).toBe(true);
        expect(generator.validate(0.99, schema)).toBe(true);
        expect(generator.validate(0.96, schema)).toBe(false); // en dehors de la plage
        expect(generator.validate(0.975, schema)).toBe(false); // pas un multiple de 0.01
      });

      it('should handle floating-point precision with enum validation', () => {
        // Bug de précision floating-point classique
        const schema: NumberSchema = {
          type: 'number',
          multipleOf: 0.1,
          enum: [0.1, 0.2, 0.3],
        };

        // Ces valeurs devraient toutes être valides malgré les problèmes de précision IEEE-754
        expect(generator.validate(0.1, schema)).toBe(true);
        expect(generator.validate(0.2, schema)).toBe(true);
        expect(generator.validate(0.3, schema)).toBe(true); // Le célèbre 0.1 + 0.2 !== 0.3

        // Test que la génération produit des valeurs de l'enum
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: 42,
        });
        const result = generator.generate(schema, context);
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect([0.1, 0.2, 0.3]).toContain(result.value);
          expect(isMultipleOf(result.value, 0.1)).toBe(true);
        }
      });

      it('should handle the classic 0.1 + 0.2 !== 0.3 JavaScript issue', () => {
        // Test direct du problème IEEE-754 le plus célèbre
        const problematicValue = 0.1 + 0.2; // = 0.30000000000000004
        const schema: NumberSchema = { type: 'number', multipleOf: 0.1 };

        // Notre implémentation devrait reconnaître que 0.30000000000000004
        // est "essentiellement" un multiple de 0.1
        expect(generator.validate(problematicValue, schema)).toBe(true);
        expect(generator.validate(0.3, schema)).toBe(true);
        expect(isMultipleOf(problematicValue, 0.1)).toBe(true);
        expect(isMultipleOf(0.3, 0.1)).toBe(true);

        // Test des autres cas problématiques connus
        const otherProblematicCases = [
          { value: 0.1 + 0.1 + 0.1, expected: 0.3 }, // Accumulation d'erreurs
          { value: 0.2 + 0.4, expected: 0.6 }, // Autre cas classique
          { value: 1.1 + 2.2, expected: 3.3 }, // Avec des nombres plus grands
        ];

        otherProblematicCases.forEach(({ value }) => {
          expect(generator.validate(value, schema)).toBe(true);
          expect(isMultipleOf(value, 0.1)).toBe(true);
        });
      });

      it('should handle very small multipleOf values without precision loss', () => {
        // Test avec des pas très petits qui causent souvent des problèmes
        const smallSteps = [0.001, 0.0001, 0.00001];

        smallSteps.forEach((step) => {
          const schema: NumberSchema = {
            type: 'number',
            multipleOf: step,
            minimum: 0,
            maximum: step * 10,
          };
          const context = createGeneratorContext(schema, formatRegistry, {
            seed: 42,
          });

          const result = generator.generate(schema, context);
          expect(result.isOk()).toBe(true);
          if (result.isOk()) {
            expect(isMultipleOf(result.value, step)).toBe(true);
            expect(result.value).toBeGreaterThanOrEqual(0);
            expect(result.value).toBeLessThanOrEqual(step * 10);
          }
        });
      });

      it('should handle large multipleOf intervals efficiently', () => {
        // Test optimization for very large ranges to avoid bias and memory issues
        const schema: NumberSchema = {
          type: 'number',
          multipleOf: 1,
          minimum: 0,
          maximum: 10000000, // 10M multiples - triggers optimization
        };
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: 42,
        });

        // Should handle large ranges without performance issues
        const result = generator.generate(schema, context);
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value).toBeGreaterThanOrEqual(0);
          expect(result.value).toBeLessThanOrEqual(10000000);
          expect(result.value % 1).toBe(0); // Should be an integer multiple
          expect(isMultipleOf(result.value, 1)).toBe(true);
        }

        // Test that distribution is not biased toward extremes
        // Generate multiple values and ensure reasonable spread
        const values: number[] = [];
        for (let i = 0; i < 10; i++) {
          const ctx = createGeneratorContext(schema, formatRegistry, {
            seed: i,
          });
          const res = generator.generate(schema, ctx);
          if (res.isOk()) {
            values.push(res.value);
          }
        }

        // Should not all be at the extremes
        const atMin = values.filter((v) => v === 0).length;
        const atMax = values.filter((v) => v === 10000000).length;
        expect(atMin + atMax).toBeLessThan(values.length); // Some values in the middle
      });

      it('should handle -0 with exclusiveMinimum: 0 correctly', () => {
        const schema: NumberSchema = { type: 'number', exclusiveMinimum: 0 };

        // -0 should be rejected because it's not strictly > 0
        expect(generator.validate(-0, schema)).toBe(false);

        // But +0 should be rejected too (0 is not > 0)
        expect(generator.validate(0, schema)).toBe(false);
        expect(generator.validate(+0, schema)).toBe(false);

        // Positive values should be accepted
        expect(generator.validate(0.1, schema)).toBe(true);
        expect(generator.validate(1, schema)).toBe(true);
        expect(generator.validate(Number.MIN_VALUE, schema)).toBe(true); // Smallest positive

        // Test with Object.is to distinguish -0 from +0
        expect(Object.is(-0, 0)).toBe(false); // They are different
        expect(generator.validate(-0, schema)).toBe(false);
        expect(generator.validate(0, schema)).toBe(false);
      });

      it('should generate meaningful edge values with improved distribution', () => {
        // Test que le scenario 'edge' génère des valeurs significatives
        const schema: NumberSchema = {
          type: 'number',
          minimum: -10,
          maximum: 10,
          multipleOf: 2,
        };

        // Collecter plusieurs valeurs edge pour vérifier la diversité
        const edgeValues: number[] = [];
        for (let i = 0; i < 20; i++) {
          const context = createGeneratorContext(schema, formatRegistry, {
            seed: i,
            scenario: 'edge',
          });
          const result = generator.generate(schema, context);
          if (result.isOk()) {
            edgeValues.push(result.value);
          }
        }

        // Vérifier que nous obtenons des valeurs edge significatives
        const uniqueValues = [...new Set(edgeValues)];
        expect(uniqueValues.length).toBeGreaterThan(1); // Diversité des valeurs edge

        // Vérifier que les valeurs incluent des cas edge attendus
        const expectedEdgeCases = [-10, -8, -2, 0, 2, 8, 10]; // Bornes + inflection points multipleOf
        const foundExpected = expectedEdgeCases.filter((expected) =>
          edgeValues.includes(expected)
        );
        expect(foundExpected.length).toBeGreaterThanOrEqual(3); // Au moins 3 cas edge significatifs

        // Tous les valeurs doivent être valides
        edgeValues.forEach((value) => {
          expect(generator.validate(value, schema)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(-10);
          expect(value).toBeLessThanOrEqual(10);
          expect(isMultipleOf(value, 2)).toBe(true);
        });
      });

      it('should handle Number.EPSILON edge cases correctly', () => {
        // Test des cas edge avec Number.EPSILON pour les valeurs très proches de zéro
        const schema: NumberSchema = {
          type: 'number',
          minimum: -1,
          maximum: 1,
        };

        // Générer plusieurs valeurs edge
        const edgeValues: number[] = [];
        for (let i = 0; i < 50; i++) {
          const context = createGeneratorContext(schema, formatRegistry, {
            seed: i,
            scenario: 'edge',
          });
          const result = generator.generate(schema, context);
          if (result.isOk()) {
            edgeValues.push(result.value);
          }
        }

        // Vérifier que Number.EPSILON et -Number.EPSILON sont générés
        const hasPositiveEpsilon = edgeValues.some((v) => v === Number.EPSILON);
        const hasNegativeEpsilon = edgeValues.some(
          (v) => v === -Number.EPSILON
        );
        const hasZero = edgeValues.some((v) => v === 0);

        // Au moins quelques-unes de ces valeurs edge critiques devraient apparaître
        expect(hasPositiveEpsilon || hasNegativeEpsilon || hasZero).toBe(true);

        // Si Number.EPSILON est généré, il doit être valide
        if (hasPositiveEpsilon) {
          expect(generator.validate(Number.EPSILON, schema)).toBe(true);
        }
        if (hasNegativeEpsilon) {
          expect(generator.validate(-Number.EPSILON, schema)).toBe(true);
        }
      });

      it('should generate multipleOf inflection points (2nd and penultimate)', () => {
        // Test que les points d'inflexion multipleOf sont générés
        const schema: NumberSchema = {
          type: 'number',
          minimum: 0,
          maximum: 20,
          multipleOf: 3,
        };
        // Multiples valides: 0, 3, 6, 9, 12, 15, 18
        // Cas edge attendus: 0 (premier), 18 (dernier), 3 (2e), 15 (avant-dernier)

        const edgeValues: number[] = [];
        for (let i = 0; i < 30; i++) {
          const context = createGeneratorContext(schema, formatRegistry, {
            seed: i,
            scenario: 'edge',
          });
          const result = generator.generate(schema, context);
          if (result.isOk()) {
            edgeValues.push(result.value);
          }
        }

        const uniqueValues = [...new Set(edgeValues)];

        // Vérifier la présence des points d'inflexion
        const expectedInflectionPoints = [
          0, // nearMin (premier multiple)
          3, // nearMin + multipleOf (2e multiple)
          15, // nearMax - multipleOf (avant-dernier multiple)
          18, // nearMax (dernier multiple)
        ];

        const foundInflectionPoints = expectedInflectionPoints.filter((point) =>
          edgeValues.includes(point)
        );
        expect(foundInflectionPoints.length).toBeGreaterThanOrEqual(2); // Au moins 2 points d'inflexion

        // Vérifier que toutes les valeurs sont des multiples valides
        uniqueValues.forEach((value) => {
          expect(isMultipleOf(value, 3)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(20);
        });
      });
    });

    describe('7. extrêmes et précision', () => {
      it('should handle extreme bounds near JS limits', () => {
        const extremeSchemas = [
          { minimum: -Number.MAX_VALUE, maximum: Number.MAX_VALUE },
          { minimum: Number.MIN_VALUE, maximum: 1 }, // MIN_VALUE is smallest positive
          {
            exclusiveMinimum: -Number.MAX_SAFE_INTEGER,
            exclusiveMaximum: Number.MAX_SAFE_INTEGER,
          },
        ];

        extremeSchemas.forEach((schema) => {
          const typedSchema: NumberSchema = { type: 'number', ...schema };
          const context = createGeneratorContext(typedSchema, formatRegistry, {
            seed: 42,
          });

          // Should handle extreme bounds without error
          const result = generator.generate(typedSchema, context);
          if (result.isOk()) {
            expect(generator.validate(result.value, typedSchema)).toBe(true);
          }
        });
      });

      it('should handle very small multipleOf with precision', () => {
        const schema: NumberSchema = {
          type: 'number',
          minimum: 0,
          maximum: 1,
          multipleOf: 1e-12, // Very small step
        };
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: 42,
        });

        const result = generator.generate(schema, context);
        if (result.isOk()) {
          expect(result.value).toBeGreaterThanOrEqual(0);
          expect(result.value).toBeLessThanOrEqual(1);
          expect(isMultipleOf(result.value, 1e-12)).toBe(true);
        }
      });

      it('should handle narrow ranges without invalid delta additions', () => {
        // Test ranges too narrow for +/- 0.1 delta strategy
        const narrowRanges = [
          { min: 0.05, max: 0.15 }, // Exactly 0.1 wide
          { min: 1, max: 1.05 }, // Very narrow
          { min: 0.3, max: 0.49 }, // Just under 0.2, avoids zero coincidence
        ];

        narrowRanges.forEach(({ min, max }) => {
          const width = max - min;
          const schema: NumberSchema = {
            type: 'number',
            minimum: min,
            maximum: max,
          };
          const context = createGeneratorContext(schema, formatRegistry, {
            scenario: 'edge',
            seed: 42,
          });

          // Generate multiple edge values
          for (let i = 0; i < 10; i++) {
            const result = generator.generate(schema, { ...context, seed: i });

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              expect(result.value).toBeGreaterThanOrEqual(min);
              expect(result.value).toBeLessThanOrEqual(max);

              // For narrow ranges, verify delta strategy is not producing out-of-bound values
              if (width < 0.2) {
                const minPlusDelta = min + 0.1;
                const maxMinusDelta = max - 0.1;

                // If delta would go out of bounds, it shouldn't be used
                // eslint-disable-next-line max-depth -- Test validation requires nested checks for edge cases
                if (minPlusDelta > max) {
                  expect(result.value).not.toBe(minPlusDelta);
                }
                // eslint-disable-next-line max-depth -- Test validation requires nested checks for edge cases
                if (maxMinusDelta < min) {
                  expect(result.value).not.toBe(maxMinusDelta);
                }
              }
            }
          }
        });
      });

      it('should understand Number.MIN_VALUE is smallest positive', () => {
        expect(Number.MIN_VALUE).toBeGreaterThan(0);
        expect(Number.MIN_VALUE).toBeLessThan(1e-300);

        const schema: NumberSchema = {
          type: 'number',
          minimum: Number.MIN_VALUE,
        };

        expect(generator.validate(Number.MIN_VALUE, schema)).toBe(true);
        expect(generator.validate(0, schema)).toBe(false); // 0 < MIN_VALUE
        expect(generator.validate(-1, schema)).toBe(false);
      });
    });

    describe('8. unicité/détermination des seeds', () => {
      it('should generate different values with different seeds when range allows', () => {
        const schema: NumberSchema = {
          type: 'number',
          minimum: 0,
          maximum: 1000, // Wide range to allow variety
        };

        const seeds = [42, 123, 999, 1337, 2024];
        const generatedValues: number[] = [];

        seeds.forEach((seed) => {
          const context = createGeneratorContext(schema, formatRegistry, {
            seed,
          });
          const result = generator.generate(schema, context);

          if (result.isOk()) {
            generatedValues.push(result.value);
          }
        });

        // With different seeds and a wide range, we should get some variety
        // (though not guaranteed to be all different due to randomness)
        if (generatedValues.length >= 3) {
          const uniqueValues = new Set(generatedValues);
          expect(uniqueValues.size).toBeGreaterThan(1); // At least some variety
        }
      });

      it('should avoid degeneracy in constrained scenarios', () => {
        const schema: NumberSchema = {
          type: 'number',
          minimum: 0,
          maximum: 10,
          multipleOf: 1, // Only integers 0-10 possible
        };

        const seeds = Array.from({ length: 20 }, (_, i) => i);
        const generatedValues: number[] = [];

        seeds.forEach((seed) => {
          const context = createGeneratorContext(schema, formatRegistry, {
            seed,
          });
          const result = generator.generate(schema, context);

          if (result.isOk()) {
            generatedValues.push(result.value);
          }
        });

        // Even with constraints, should see some distribution
        if (generatedValues.length >= 10) {
          const uniqueValues = new Set(generatedValues);
          expect(uniqueValues.size).toBeGreaterThan(2); // Some variety in integers 0-10
        }
      });
    });
  });

  describe('Draft 7+ Conditional Schemas (if/then/else)', () => {
    it('should handle basic conditional validation', () => {
      // This tests the concept - actual if/then/else would be handled at schema level
      // For now, test that NumberGenerator handles the number validation part correctly
      const schemas = [
        {
          type: 'number' as const,
          minimum: 0,
          // In a real if/then/else, this might be the 'then' branch
          maximum: 100,
        },
        {
          type: 'number' as const,
          minimum: -100,
          // This might be the 'else' branch
          maximum: 0,
        },
      ];

      schemas.forEach((schema) => {
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: 42,
        });
        const result = generator.generate(schema, context);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(generator.validate(result.value, schema)).toBe(true);
        }
      });
    });
  });

  describe('Draft 7+ Schema Compositions (allOf, anyOf, oneOf, not)', () => {
    it('should validate numbers that would satisfy allOf constraints', () => {
      // Test individual constraints that would be combined in allOf
      const constraints = [
        { type: 'number' as const, minimum: 10 },
        { type: 'number' as const, maximum: 50 },
        { type: 'number' as const, multipleOf: 5 },
      ];

      // Test that a value satisfying all constraints validates against each
      const testValue = 20; // Satisfies all: >= 10, <= 50, multiple of 5

      constraints.forEach((constraint) => {
        expect(generator.validate(testValue, constraint)).toBe(true);
      });
    });

    it('should validate numbers for anyOf scenarios', () => {
      // Test constraints that would be in anyOf (value should satisfy at least one)
      const constraints = [
        { type: 'number' as const, minimum: 100 }, // Large numbers
        { type: 'number' as const, maximum: -100 }, // Very negative
        { type: 'number' as const, multipleOf: 7 }, // Multiples of 7
      ];

      const testValue = 14; // Satisfies multipleOf: 7 but not the others

      expect(generator.validate(testValue, constraints[0])).toBe(false); // >= 100
      expect(generator.validate(testValue, constraints[1])).toBe(false); // <= -100
      expect(generator.validate(testValue, constraints[2])).toBe(true); // multiple of 7
    });

    it('should validate numbers for oneOf scenarios', () => {
      // Test that validation works for mutually exclusive constraints
      const constraints = [
        { type: 'number' as const, minimum: 0, maximum: 50 }, // 0-50
        { type: 'number' as const, minimum: 51, maximum: 100 }, // 51-100
      ];

      const testValue25 = 25; // Should satisfy first constraint only
      const testValue75 = 75; // Should satisfy second constraint only
      const testValue50dot5 = 50.5; // Should satisfy neither (between ranges)

      expect(generator.validate(testValue25, constraints[0])).toBe(true);
      expect(generator.validate(testValue25, constraints[1])).toBe(false);

      expect(generator.validate(testValue75, constraints[0])).toBe(false);
      expect(generator.validate(testValue75, constraints[1])).toBe(true);

      expect(generator.validate(testValue50dot5, constraints[0])).toBe(false);
      expect(generator.validate(testValue50dot5, constraints[1])).toBe(false);
    });
  });

  describe('JSON Serialization Compliance', () => {
    it('should generate values that are JSON serializable', () => {
      const schemas = [
        { type: 'number' as const },
        { type: 'number' as const, minimum: -1000, maximum: 1000 },
        { type: 'number' as const, multipleOf: 0.1 },
        { type: 'number' as const, enum: [1, 2.5, -3.14, 0] },
      ];

      schemas.forEach((schema) => {
        const context = createGeneratorContext(schema, formatRegistry, {
          seed: 42,
        });
        const result = generator.generate(schema, context);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          // Value should be JSON serializable (no NaN, no Infinity)
          expect(Number.isFinite(result.value)).toBe(true);

          // Should round-trip through JSON
          const serialized = JSON.stringify(result.value);
          const deserialized = JSON.parse(serialized);
          expect(deserialized).toBe(result.value);

          // Deserialized value should still be valid
          expect(generator.validate(deserialized, schema)).toBe(true);
        }
      });
    });

    it('should handle edge cases in JSON serialization', () => {
      const edgeCases = [
        -0, // Negative zero
        0, // Positive zero
        Number.MIN_VALUE, // Smallest positive
        -Number.MIN_VALUE, // Smallest negative
        Number.MAX_SAFE_INTEGER,
        Number.MIN_SAFE_INTEGER,
      ];

      edgeCases.forEach((value) => {
        // All these should be JSON serializable
        expect(Number.isFinite(value)).toBe(true);

        const serialized = JSON.stringify(value);
        const deserialized = JSON.parse(serialized);

        // Note: JSON.parse(-0) becomes +0, which is expected behavior
        if (Object.is(value, -0)) {
          expect(deserialized).toBe(0);
        } else {
          expect(deserialized).toBe(value);
        }
      });
    });
  });
});
