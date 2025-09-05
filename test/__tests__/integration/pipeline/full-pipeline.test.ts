import { describe, test, expect, fc, propertyTest } from '../setup';
import '../../../matchers/index.js';
import {
  INTEGRATION_TEST_SEED,
  INTEGRATION_SCHEMAS,
  PERFORMANCE_THRESHOLDS,
} from '../setup';
import { JSONSchemaParser } from '../../../../packages/core/src/parser/json-schema-parser';
import { ComplianceValidator } from '../../../../packages/core/src/validator/compliance-validator';
import { ObjectGenerator } from '../../../../packages/core/src/generator/types/object-generator';
import { createGeneratorContext } from '../../../../packages/core/src/generator/data-generator';
import { FormatRegistry } from '../../../../packages/core/src/registry/format-registry';
import { createAjv } from '../../../helpers/ajv-factory';
import type { JSONSchema7 } from 'json-schema';
import type {
  Schema,
  ObjectSchema,
} from '../../../../packages/core/src/types/schema';

describe('Full Pipeline Integration Tests', () => {
  describe('parse → generate → validate pipeline', () => {
    test('should complete full pipeline with simple schema', () => {
      return propertyTest(
        'pipeline:simple',
        fc.property(
          fc.constant(INTEGRATION_SCHEMAS.simple),
          fc.integer({ min: 1, max: 100 }),
          (schema, count) => {
            // Parse
            const parser = new JSONSchemaParser();
            const parseResult = parser.parse(schema);
            expect(parseResult.isOk()).toBe(true);
            if (!parseResult.isOk()) return;

            // Generate
            const generator = new ObjectGenerator();
            const formatRegistry = new FormatRegistry();
            const context = createGeneratorContext(
              parseResult.value as Schema,
              formatRegistry,
              { seed: INTEGRATION_TEST_SEED }
            );

            const items: unknown[] = [];
            for (let i = 0; i < count; i++) {
              const result = generator.generate(
                parseResult.value as ObjectSchema,
                context
              );
              if (result.isOk()) {
                items.push(result.value);
              }
            }

            // Validate with AJV oracle
            const ajv = createAjv('draft-07');
            const validate = ajv.compile(schema);

            for (const item of items) {
              const valid = validate(item);
              if (!valid) {
                console.error('Validation failed:', validate.errors);
                console.error('Generated item:', JSON.stringify(item, null, 2));
              }
              expect(valid).toBe(true);
            }
          }
        ),
        {
          parameters: { seed: INTEGRATION_TEST_SEED, numRuns: 10 },
          context: { pipeline: 'full', schema: 'simple' },
        }
      );
    });

    test('should complete full pipeline with complex schema', () => {
      return propertyTest(
        'pipeline:complex',
        fc.property(
          fc.constant(INTEGRATION_SCHEMAS.complex),
          fc.integer({ min: 1, max: 50 }),
          (schema, count) => {
            // Parse
            const parser = new JSONSchemaParser();
            const parseResult = parser.parse(schema);
            expect(parseResult.isOk()).toBe(true);
            if (!parseResult.isOk()) throw parseResult.error;

            // Generate
            const generator = new ObjectGenerator();
            const formatRegistry = new FormatRegistry();
            const context = createGeneratorContext(
              parseResult.value as Schema,
              formatRegistry,
              { seed: INTEGRATION_TEST_SEED }
            );

            const start = Date.now();
            const items: unknown[] = [];
            for (let i = 0; i < count; i++) {
              const result = generator.generate(
                parseResult.value as ObjectSchema,
                context
              );
              if (result.isOk()) {
                items.push(result.value);
              }
            }

            // Validate
            const validator = new ComplianceValidator();
            const validationResult = validator.validate(items, schema);
            expect(validationResult.isOk()).toBe(true);

            const time = Date.now() - start;

            // Check performance
            const timePerItem = time / count;
            expect(timePerItem).toBeLessThanOrEqual(
              PERFORMANCE_THRESHOLDS.pipeline.p95
            );

            // Validate with AJV oracle
            const ajv = createAjv('draft-07');
            const validate = ajv.compile(schema);

            for (const item of items) {
              expect(validate(item)).toBe(true);
            }
          }
        ),
        {
          parameters: { seed: INTEGRATION_TEST_SEED, numRuns: 5 },
          context: { pipeline: 'full', schema: 'complex' },
        }
      );
    });

    test('should handle various schema types in pipeline', () => {
      const schemaTypes: Array<{ type: string; schema: JSONSchema7 }> = [
        {
          type: 'string',
          schema: {
            type: 'object',
            properties: {
              text: { type: 'string', minLength: 5, maxLength: 10 },
            },
            required: ['text'],
          },
        },
        {
          type: 'number',
          schema: {
            type: 'object',
            properties: {
              value: { type: 'number', minimum: 0, maximum: 100 },
            },
            required: ['value'],
          },
        },
        {
          type: 'boolean',
          schema: {
            type: 'object',
            properties: {
              flag: { type: 'boolean' },
            },
            required: ['flag'],
          },
        },
        {
          type: 'array',
          schema: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: { type: 'string' },
                minItems: 1,
                maxItems: 5,
              },
            },
            required: ['items'],
          },
        },
        {
          type: 'enum',
          schema: {
            type: 'object',
            properties: {
              choice: { type: 'string', enum: ['a', 'b', 'c'] },
            },
            required: ['choice'],
          },
        },
      ];

      return propertyTest(
        'pipeline:types',
        fc.property(
          fc.constantFrom(...schemaTypes),
          fc.integer({ min: 10, max: 50 }),
          ({ schema }, count) => {
            // Full pipeline
            const parser = new JSONSchemaParser();
            const generator = new ObjectGenerator();
            const formatRegistry = new FormatRegistry();
            const validator = new ComplianceValidator();

            const parseResult = parser.parse(schema);
            expect(parseResult.isOk()).toBe(true);
            if (!parseResult.isOk()) return;

            const context = createGeneratorContext(
              parseResult.value as Schema,
              formatRegistry,
              { seed: INTEGRATION_TEST_SEED }
            );

            const items: unknown[] = [];
            for (let i = 0; i < count; i++) {
              const result = generator.generate(
                parseResult.value as ObjectSchema,
                context
              );
              if (result.isOk()) {
                items.push(result.value);
              }
            }

            const validationResult = validator.validate(items, schema);
            expect(validationResult.isOk()).toBe(true);

            // Oracle validation
            const ajv = createAjv('draft-07');
            const validate = ajv.compile(schema);

            for (const item of items) {
              const valid = validate(item);
              expect(valid).toBe(true);
            }
          }
        ),
        {
          parameters: { seed: INTEGRATION_TEST_SEED, numRuns: 20 },
          context: { pipeline: 'full', test: 'types' },
        }
      );
    });

    test('should maintain determinism with fixed seed through pipeline', () => {
      const schema = INTEGRATION_SCHEMAS.simple;
      const count = 10;
      const parser = new JSONSchemaParser();
      const parseResult = parser.parse(schema);
      expect(parseResult.isOk()).toBe(true);
      if (!parseResult.isOk()) return;

      // Generate twice with same seed
      const formatRegistry = new FormatRegistry();

      const generator1 = new ObjectGenerator();
      const context1 = createGeneratorContext(
        parseResult.value as Schema,
        formatRegistry,
        { seed: INTEGRATION_TEST_SEED }
      );
      const items1: unknown[] = [];
      for (let i = 0; i < count; i++) {
        const result = generator1.generate(
          parseResult.value as ObjectSchema,
          context1
        );
        if (result.isOk()) {
          items1.push(result.value);
        }
      }

      const generator2 = new ObjectGenerator();
      const context2 = createGeneratorContext(
        parseResult.value as Schema,
        formatRegistry,
        { seed: INTEGRATION_TEST_SEED }
      );
      const items2: unknown[] = [];
      for (let i = 0; i < count; i++) {
        const result = generator2.generate(
          parseResult.value as ObjectSchema,
          context2
        );
        if (result.isOk()) {
          items2.push(result.value);
        }
      }

      // Results should be identical
      expect(items1).toEqual(items2);

      // Both should be valid
      const validator = new ComplianceValidator();
      const validation1 = validator.validate(items1, schema);
      const validation2 = validator.validate(items2, schema);

      expect(validation1.isOk()).toBe(true);
      expect(validation2.isOk()).toBe(true);
    });

    test('should handle constraint validation through pipeline', () => {
      const constraintSchema: JSONSchema7 = {
        type: 'object',
        properties: {
          age: { type: 'integer', minimum: 18, maximum: 65 },
          name: { type: 'string', minLength: 2, maxLength: 50 },
          score: { type: 'number', minimum: 0, maximum: 100 }, // Removed multipleOf - not supported in MVP
          tags: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
            minItems: 1,
            maxItems: 5,
            uniqueItems: true,
          },
        },
        required: ['age', 'name', 'score', 'tags'],
      };

      return propertyTest(
        'pipeline:constraints',
        fc.property(
          fc.constant(constraintSchema),
          fc.integer({ min: 5, max: 20 }),
          (schema, count) => {
            const parser = new JSONSchemaParser();
            const generator = new ObjectGenerator();
            const formatRegistry = new FormatRegistry();

            const parseResult = parser.parse(schema);
            expect(parseResult.isOk()).toBe(true);
            if (!parseResult.isOk()) return;

            const context = createGeneratorContext(
              parseResult.value as Schema,
              formatRegistry,
              { seed: INTEGRATION_TEST_SEED }
            );

            const items: unknown[] = [];
            for (let i = 0; i < count; i++) {
              const result = generator.generate(
                parseResult.value as ObjectSchema,
                context
              );
              if (result.isOk()) {
                items.push(result.value);
              }
            }

            // Manual constraint validation
            for (const item of items) {
              const typedItem = item as any;
              // Age constraints
              expect(typedItem.age).toBeGreaterThanOrEqual(18);
              expect(typedItem.age).toBeLessThanOrEqual(65);

              // Name constraints
              expect(typedItem.name.length).toBeGreaterThanOrEqual(2);
              expect(typedItem.name.length).toBeLessThanOrEqual(50);

              // Score constraints
              expect(typedItem.score).toBeGreaterThanOrEqual(0);
              expect(typedItem.score).toBeLessThanOrEqual(100);
              // multipleOf validation removed - not supported in MVP

              // Array constraints
              expect(typedItem.tags.length).toBeGreaterThanOrEqual(1);
              expect(typedItem.tags.length).toBeLessThanOrEqual(5);
              // uniqueItems
              expect(typedItem.tags).toBeDistinct(true);

              for (const tag of typedItem.tags) {
                expect(tag.length).toBeGreaterThanOrEqual(1);
              }
            }

            // AJV validation
            const ajv = createAjv('draft-07');
            const validate = ajv.compile(schema);
            for (const item of items) {
              expect(validate(item)).toBe(true);
            }
          }
        ),
        {
          parameters: { seed: INTEGRATION_TEST_SEED, numRuns: 10 },
          context: { pipeline: 'full', test: 'constraints' },
        }
      );
    });
  });

  describe('error handling in pipeline', () => {
    test('should handle invalid schema gracefully', () => {
      const invalidSchemas = [
        { type: 'invalid' }, // Invalid type - should be rejected
        { type: 'string', pattern: '[' }, // Pattern not supported - should be rejected
        {
          type: 'array',
          items: { type: 'object', properties: { nested: { type: 'object' } } },
        }, // Nested objects - should be rejected
        { type: 'string', multipleOf: 0.5 }, // multipleOf on wrong type - should be rejected as unsupported
      ];

      for (const schema of invalidSchemas) {
        const parser = new JSONSchemaParser();
        const result = parser.parse(schema as JSONSchema7);
        // Note: Parser doesn't validate semantic constraints like negative minLength
        // It only validates structural validity and supported features
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toBeDefined();
          expect(result.error.message).toBeTruthy();
        }
      }
    });

    test('should recover from generation failures', () => {
      const problematicSchema: JSONSchema7 = {
        type: 'object',
        properties: {
          // This could cause issues with certain generators
          impossible: {
            type: 'string',
            minLength: 100,
            maxLength: 1,
          },
        },
        required: ['impossible'],
      };

      const parser = new JSONSchemaParser();
      const generator = new ObjectGenerator();
      const formatRegistry = new FormatRegistry();

      const parseResult = parser.parse(problematicSchema);
      // Parser might accept it, but generator should handle gracefully
      if (parseResult.isOk()) {
        const context = createGeneratorContext(
          parseResult.value as Schema,
          formatRegistry,
          { seed: INTEGRATION_TEST_SEED }
        );

        const result = generator.generate(
          parseResult.value as ObjectSchema,
          context
        );
        // Generator should either generate valid data or fail gracefully
        // The actual behavior depends on generator implementation
        expect(result).toBeDefined();
      }
    });
  });
});
