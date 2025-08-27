import { describe, it, expect, beforeEach } from 'vitest';
/**
 * Property-based tests for IntegerGenerator
 * Using fast-check for robust constraint validation
 */

import fc from 'fast-check';
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

  describe('supports', () => {
    it('should support integer schemas', () => {
      fc.assert(
        fc.property(
          fc.record({
            type: fc.constant('integer'),
            minimum: fc.option(fc.integer()),
            maximum: fc.option(fc.integer()),
            multipleOf: fc.option(fc.integer({ min: 1 })),
            exclusiveMinimum: fc.option(fc.integer()),
            exclusiveMaximum: fc.option(fc.integer()),
            enum: fc.option(fc.array(fc.integer())),
            const: fc.option(fc.integer())
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
            fc.record({ type: fc.constantFrom('string', 'boolean', 'object', 'array', 'number') }),
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

    it('should reject Draft-04 boolean exclusive bounds (Draft-07+ compliance)', () => {
      // Draft-04 style with boolean exclusiveMinimum
      expect(generator.supports({
        type: 'integer',
        minimum: 0,
        exclusiveMinimum: true as any
      })).toBe(false);

      // Draft-04 style with boolean exclusiveMaximum
      expect(generator.supports({
        type: 'integer',
        maximum: 100,
        exclusiveMaximum: true as any
      })).toBe(false);

      // Draft-07+ style with numeric exclusive bounds should work
      expect(generator.supports({
        type: 'integer',
        exclusiveMinimum: 0,
        exclusiveMaximum: 100
      })).toBe(true);
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
            const context = createGeneratorContext(schema, formatRegistry, { seed });
            
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
            const context = createGeneratorContext(schema, formatRegistry, { seed });
            
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
            const context = createGeneratorContext(schema, formatRegistry, { seed });
            
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
            const context = createGeneratorContext(schema, formatRegistry, { seed });
            
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
            const context = createGeneratorContext(schema, formatRegistry, { seed });
            
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
            const schema: IntegerSchema = { type: 'integer', const: constValue };
            const context = createGeneratorContext(schema, formatRegistry, { seed });
            
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
            exclusiveMinimum: fc.integer({ min: -100, max: 100 })
          }),
          fc.integer({ min: 0, max: 1000 }),
          (constraint, seed) => {
            const schema: IntegerSchema = { type: 'integer', ...constraint };
            const context = createGeneratorContext(schema, formatRegistry, { seed });
            
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
            exclusiveMaximum: fc.integer({ min: -100, max: 100 })
          }),
          fc.integer({ min: 0, max: 1000 }),
          (constraint, seed) => {
            const schema: IntegerSchema = { type: 'integer', ...constraint };
            const context = createGeneratorContext(schema, formatRegistry, { seed });
            
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
            minimum: fc.option(fc.integer({ min: -50, max: 0 })),
            maximum: fc.option(fc.integer({ min: 0, max: 50 }))
          }),
          (seed, constraints) => {
            const schema: IntegerSchema = {
              type: 'integer',
              ...constraints
            };
            
            const context1 = createGeneratorContext(schema, formatRegistry, { seed });
            const context2 = createGeneratorContext(schema, formatRegistry, { seed });
            
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
            minimum: fc.option(fc.integer({ min: -100, max: 0 })),
            maximum: fc.option(fc.integer({ min: 0, max: 100 }))
          }),
          fc.integer({ min: 0, max: 1000 }),
          (constraints, seed) => {
            const schema: IntegerSchema = {
              type: 'integer',
              ...constraints
            };
            const context = createGeneratorContext(schema, formatRegistry, {
              seed,
              scenario: 'edge'
            });
            
            const result = generator.generate(schema, context);
            
            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              if (constraints.minimum !== null) {
                expect(result.value).toBeGreaterThanOrEqual(constraints.minimum);
              }
              if (constraints.maximum !== null) {
                expect(result.value).toBeLessThanOrEqual(constraints.maximum);
              }
              expect(Number.isInteger(result.value)).toBe(true);
            }
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
            multipleOf: fc.integer({ min: 2, max: 5 })
          }),
          fc.integer({ min: 0, max: 1000 }),
          (constraints, seed) => {
            const schema: IntegerSchema = {
              type: 'integer',
              ...constraints
            };
            const context = createGeneratorContext(schema, formatRegistry, { seed });
            
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
            maximum: fc.integer({ min: 0, max: 1000000 })
          }),
          fc.integer({ min: 0, max: 1000 }),
          (constraints, seed) => {
            const schema: IntegerSchema = {
              type: 'integer',
              ...constraints
            };
            const context = createGeneratorContext(schema, formatRegistry, { seed });
            
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
              maximum: value
            };
            const context = createGeneratorContext(schema, formatRegistry, { seed });
            
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
            minimum: fc.option(fc.integer({ min: -100, max: 100 })),
            maximum: fc.option(fc.integer({ min: -100, max: 100 })),
            multipleOf: fc.option(fc.integer({ min: 1, max: 10 }))
          }),
          (value, constraints) => {
            const schema: IntegerSchema = {
              type: 'integer',
              ...(constraints.minimum !== null && { minimum: constraints.minimum }),
              ...(constraints.maximum !== null && { maximum: constraints.maximum }),
              ...(constraints.multipleOf !== null && { multipleOf: constraints.multipleOf })
            };
            
            const isValid = generator.validate(value, schema);
            
            // Check if the value should be valid according to constraints
            let shouldBeValid = true;
            
            if (constraints.minimum !== null && value < constraints.minimum) {
              shouldBeValid = false;
            }
            if (constraints.maximum !== null && value > constraints.maximum) {
              shouldBeValid = false;
            }
            if (constraints.multipleOf !== null && value % constraints.multipleOf !== 0) {
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
            fc.float().filter(n => !Number.isInteger(n)) // Non-integer numbers
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
        fc.property(
          fc.integer(),
          fc.integer(),
          (constValue, testValue) => {
            const schema: IntegerSchema = { type: 'integer', const: constValue };
            const isValid = generator.validate(testValue, schema);
            const shouldBeValid = testValue === constValue;
            
            expect(isValid).toBe(shouldBeValid);
          }
        )
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
            exclusiveMinimum: fc.integer({ min: -30, max: 30 })
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
        fc.property(
          fc.integer(),
          (constValue) => {
            const schema: IntegerSchema = { type: 'integer', const: constValue };
            const examples = generator.getExamples(schema);
            
            expect(examples).toEqual([constValue]);
          }
        )
      );
    });

    it('should return schema examples when available', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer(), { minLength: 1, maxLength: 5 }),
          (schemaExamples) => {
            const schema: IntegerSchema = { type: 'integer', examples: schemaExamples };
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
            minimum: fc.option(fc.integer({ min: -10, max: 0 })),
            maximum: fc.option(fc.integer({ min: 0, max: 10 }))
          }),
          (constraints) => {
            const schema: IntegerSchema = {
              type: 'integer',
              ...constraints
            };
            const examples = generator.getExamples(schema);
            
            expect(Array.isArray(examples)).toBe(true);
            expect(examples.length).toBeGreaterThan(0);
            
            // All examples should be integers and meet constraints
            examples.forEach(example => {
              expect(typeof example).toBe('number');
              expect(Number.isInteger(example)).toBe(true);
              if (constraints.minimum !== null) {
                expect(example).toBeGreaterThanOrEqual(constraints.minimum);
              }
              if (constraints.maximum !== null) {
                expect(example).toBeLessThanOrEqual(constraints.maximum);
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
          fc.record({
            minimum: fc.option(fc.integer({ min: -50, max: 0 })),
            maximum: fc.option(fc.integer({ min: 0, max: 50 })),
            multipleOf: fc.option(fc.integer({ min: 2, max: 5 })),
            enum: fc.option(fc.array(fc.integer(), { minLength: 1, maxLength: 5 }))
          }),
          fc.integer({ min: 0, max: 1000 }),
          (schemaProps, seed) => {
            const schema: IntegerSchema = {
              type: 'integer',
              ...(schemaProps.minimum !== null && { minimum: schemaProps.minimum }),
              ...(schemaProps.maximum !== null && { maximum: schemaProps.maximum }),
              ...(schemaProps.multipleOf !== null && { multipleOf: schemaProps.multipleOf }),
              ...(schemaProps.enum !== null && { enum: schemaProps.enum })
            };
            const context = createGeneratorContext(schema, formatRegistry, { seed });
            
            const result = generator.generate(schema, context);
            
            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
              // Generated value should always be valid according to the schema
              expect(generator.validate(result.value, schema)).toBe(true);
              expect(Number.isInteger(result.value)).toBe(true);
            }
          }
        )
      );
    });

    it('should handle boundary conditions correctly', () => {
      const boundaryValues = [
        { minimum: 0, maximum: 0 }, // Single point
        { minimum: 1, maximum: 3, multipleOf: 4 }, // No valid values
        { minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER }
      ];

      boundaryValues.forEach((constraints, index) => {
        const schema: IntegerSchema = {
          type: 'integer',
          ...constraints
        };
        const context = createGeneratorContext(schema, formatRegistry, { seed: index });
        
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
        maximum: Number.MAX_SAFE_INTEGER
      };
      const context = createGeneratorContext(schema, formatRegistry, { seed: 42 });
      
      const result = generator.generate(schema, context);
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(Number.isSafeInteger(result.value)).toBe(true);
        expect(generator.validate(result.value, schema)).toBe(true);
      }
    });
  });
});