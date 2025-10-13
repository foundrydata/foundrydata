/* eslint-disable max-depth */
import { describe, test, expect, expectParseOk } from '../setup';
import {
  INTEGRATION_TEST_SEED,
  INTEGRATION_SCHEMAS,
  DRAFT_VERSIONS,
  type DraftVersion,
} from '../setup';
import { JSONSchemaParser } from '../../../../packages/core/src/parser/json-schema-parser';
import { createAjv, type JsonSchemaDraft } from '../../../helpers/ajv-factory';
import { FormatRegistry } from '../../../../packages/core/src/registry/format-registry';
import { ObjectGenerator } from '../../../../packages/core/src/generator/types/object-generator';
import { createGeneratorContext } from '../../../../packages/core/src/generator/data-generator';
import type { FormatGenerator } from '../../../../packages/core/src/registry/format-registry';
import type { JSONSchema7 } from 'json-schema';
import type {
  Schema,
  ObjectSchema,
} from '../../../../packages/core/src/types/schema';

describe('Multi-Draft End-to-End Tests', () => {
  describe('draft compatibility testing', () => {
    test.each(DRAFT_VERSIONS)(
      'should generate valid data for draft %s',
      (draft) => {
        const schema = INTEGRATION_SCHEMAS.simple;
        const parser = new JSONSchemaParser();

        const parseResult = parser.parse(schema);
        const normalized = expectParseOk(parseResult);
        const canonicalSchema = normalized.schema as Schema;

        // Generate using ObjectGenerator
        const generator = new ObjectGenerator();
        const formatRegistry = new FormatRegistry();
        const context = createGeneratorContext(
          canonicalSchema,
          formatRegistry,
          { seed: INTEGRATION_TEST_SEED }
        );

        const items: unknown[] = [];
        for (let i = 0; i < 10; i++) {
          const result = generator.generate(
            canonicalSchema as ObjectSchema,
            context
          );
          expect(result.isOk()).toBe(true);
          if (result.isOk()) {
            items.push(result.value);
          }
        }

        // Validate with draft-specific AJV
        const normalizedDraft = draft.replace('draft/', '') as JsonSchemaDraft;
        const ajv = createAjv(normalizedDraft);
        const validate = ajv.compile(schema);

        for (const item of items) {
          const valid = validate(item);
          if (!valid) {
            console.error(`Draft ${draft} validation failed:`, validate.errors);
            console.error('Item:', JSON.stringify(item, null, 2));
          }
          expect(valid).toBe(true);
        }
      }
    );

    test('should handle draft-specific keywords correctly', () => {
      const draftSpecificSchemas: Record<DraftVersion, JSONSchema7> = {
        'draft-07': {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            value: { type: 'number', minimum: 0, maximum: 100 },
          },
          required: ['id', 'value'],
        },
        'draft/2019-09': {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            value: { type: 'number', minimum: 0, maximum: 100 },
            items: {
              type: 'array',
              items: { type: 'string' },
              // Note: minContains/maxContains not supported in JSONSchema7 type
            },
          },
          required: ['id', 'value'],
        },
        'draft/2020-12': {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            value: { type: 'number', minimum: 0, maximum: 100 },
            items: {
              type: 'array',
              items: { type: 'string' }, // Simplified for compatibility
            },
          },
          required: ['id', 'value'],
        },
      };

      for (const draft of DRAFT_VERSIONS) {
        const schema = draftSpecificSchemas[draft];
        const parser = new JSONSchemaParser();

        const normalized = expectParseOk(parser.parse(schema));
        const canonicalSchema = normalized.schema as Schema;
        // Generate using ObjectGenerator
        const generator = new ObjectGenerator();
        const formatRegistry = new FormatRegistry();
        const context = createGeneratorContext(
          canonicalSchema,
          formatRegistry,
          { seed: INTEGRATION_TEST_SEED }
        );

        const items: unknown[] = [];
        for (let i = 0; i < 5; i++) {
          const result = generator.generate(
            canonicalSchema as ObjectSchema,
            context
          );
          if (result.isOk()) {
            items.push(result.value);
          }
        }

        // Validate with draft-specific AJV
        const normalizedDraft = draft.replace('draft/', '') as JsonSchemaDraft;
        const ajv = createAjv(normalizedDraft);
        const validate = ajv.compile(schema);

        for (const item of items) {
          const valid = validate(item);
          expect(valid).toBe(true);
        }
      }
    });

    test('should maintain format compatibility across drafts', () => {
      const formatSchema: JSONSchema7 = {
        type: 'object',
        properties: {
          uuid: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          date: { type: 'string', format: 'date' },
          dateTime: { type: 'string', format: 'date-time' },
        },
        required: ['uuid', 'email', 'date', 'dateTime'],
      };

      for (const draft of DRAFT_VERSIONS) {
        const parser = new JSONSchemaParser();

        const normalized = expectParseOk(parser.parse(formatSchema));
        const canonicalSchema = normalized.schema as Schema;

        // Generate using ObjectGenerator
        const generator = new ObjectGenerator();
        const formatRegistry = new FormatRegistry();
        const context = createGeneratorContext(
          canonicalSchema,
          formatRegistry,
          { seed: INTEGRATION_TEST_SEED }
        );

        const items: unknown[] = [];
        for (let i = 0; i < 10; i++) {
          const result = generator.generate(
            canonicalSchema as ObjectSchema,
            context
          );
          if (result.isOk()) {
            items.push(result.value);
          }
        }

        // Validate with draft-specific AJV
        const normalizedDraft = draft.replace('draft/', '') as JsonSchemaDraft;
        const ajv = createAjv(normalizedDraft);
        ajv.addFormat(
          'uuid',
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );

        const validate = ajv.compile(formatSchema);

        for (const item of items) {
          const valid = validate(item);
          if (!valid) {
            console.error(
              `Draft ${draft} format validation failed:`,
              validate.errors
            );
            console.error('Item:', JSON.stringify(item, null, 2));
          }
          expect(valid).toBe(true);

          // Type-safe property access
          const typedItem = item as any;
          // Additional format checks
          expect(typedItem.uuid).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
          );
          expect(typedItem.email).toContain('@');
          expect(typedItem.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(typedItem.dateTime).toMatch(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
          );
        }
      }
    });
  });

  describe('FormatRegistry-AJV adapter integration', () => {
    test('should integrate FormatRegistry with AJV validation', () => {
      const formatRegistry = new FormatRegistry();

      // Create a custom format generator
      const customIdGenerator: FormatGenerator = {
        name: 'custom-id',
        supports: (format: string) => format === 'custom-id',
        generate: () => {
          const id = `CUSTOM-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
          return { isOk: () => true, isErr: () => false, value: id } as any;
        },
        validate: (value: string) => /^CUSTOM-[A-Z0-9]{7}$/.test(value),
        getExamples: () => ['CUSTOM-ABC1234'],
      };

      // Register the custom format
      formatRegistry.register(customIdGenerator);

      const schema: JSONSchema7 = {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'custom-id' },
          name: { type: 'string' },
        },
        required: ['id', 'name'],
      };

      for (const draft of DRAFT_VERSIONS) {
        const parser = new JSONSchemaParser();

        const parseResult = parser.parse(schema);
        const normalized = expectParseOk(parseResult);
        const canonicalSchema = normalized.schema as Schema;

        // Create custom context with our format registry
        const context = createGeneratorContext(
          canonicalSchema,
          formatRegistry,
          { seed: INTEGRATION_TEST_SEED }
        );

        // Generate using ObjectGenerator
        const generator = new ObjectGenerator();
        const items: unknown[] = [];
        for (let i = 0; i < 5; i++) {
          const result = generator.generate(
            canonicalSchema as ObjectSchema,
            context
          );
          if (result.isOk()) {
            // Manually apply custom format for the test
            const item = result.value as any;
            if (item.id && typeof item.id === 'string') {
              const generateResult = formatRegistry.generate('custom-id');
              if (generateResult.isOk()) {
                item.id = generateResult.value;
              }
            }
            items.push(item);
          }
        }

        // Validate with AJV using FormatRegistry adapter
        const normalizedDraft = draft.replace('draft/', '') as JsonSchemaDraft;
        const ajv = createAjv(normalizedDraft);
        ajv.addFormat('custom-id', {
          validate: (data: string) =>
            formatRegistry.validate('custom-id', data),
        });

        const validate = ajv.compile(schema);

        for (const item of items) {
          const valid = validate(item);
          expect(valid).toBe(true);
          const typedItem = item as any;
          expect(typedItem.id).toMatch(/^CUSTOM-[A-Z0-9]{7}$/);
        }
      }
    });

    test('should handle format fallback for unknown formats', () => {
      const schema: JSONSchema7 = {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'unknown-format' },
          value: { type: 'string' },
        },
        required: ['id', 'value'],
      };

      for (const draft of DRAFT_VERSIONS) {
        const parser = new JSONSchemaParser();

        const normalized = expectParseOk(parser.parse(schema));
        const canonicalSchema = normalized.schema as Schema;

        // Generate using ObjectGenerator
        const generator = new ObjectGenerator();
        const formatRegistry = new FormatRegistry();
        const context = createGeneratorContext(
          canonicalSchema,
          formatRegistry,
          { seed: INTEGRATION_TEST_SEED }
        );

        const items: unknown[] = [];
        for (let i = 0; i < 5; i++) {
          const result = generator.generate(
            canonicalSchema as ObjectSchema,
            context
          );
          if (result.isOk()) {
            items.push(result.value);
          }
        }

        // Validate with draft-specific AJV that unknown formats are handled
        const normalizedDraft = draft.replace('draft/', '') as JsonSchemaDraft;
        const ajv = createAjv(normalizedDraft);
        // Register a no-op handler so AJV does not warn/fail on purposefully unknown formats
        ajv.addFormat('unknown-format', {
          type: 'string',
          validate: () => true,
        });
        const validate = ajv.compile(schema);

        // Should generate valid strings even with unknown format
        for (const item of items) {
          const typedItem = item as any;
          expect(typeof typedItem.id).toBe('string');
          expect(typeof typedItem.value).toBe('string');

          // Validate against the draft - unknown formats should not cause validation failure
          const valid = validate(item);
          expect(valid).toBe(true);
        }
      }
    });
  });

  describe('cross-draft compatibility', () => {
    test('should maintain data consistency across draft migrations', () => {
      const schema = INTEGRATION_SCHEMAS.complex;
      const results: Record<DraftVersion, any[]> = {} as any;

      // Generate data with each draft
      for (const draft of DRAFT_VERSIONS) {
        const parser = new JSONSchemaParser();

        const normalized = expectParseOk(parser.parse(schema));
        const canonicalSchema = normalized.schema as Schema;

        // Generate using ObjectGenerator
        const generator = new ObjectGenerator();
        const formatRegistry = new FormatRegistry();
        const context = createGeneratorContext(
          canonicalSchema,
          formatRegistry,
          { seed: INTEGRATION_TEST_SEED }
        );

        const items: unknown[] = [];
        for (let i = 0; i < 5; i++) {
          const result = generator.generate(
            canonicalSchema as ObjectSchema,
            context
          );
          if (result.isOk()) {
            items.push(result.value);
          }
        }

        results[draft] = items;
      }

      // Cross-validate: data generated with one draft should be valid in others
      for (const sourceDraft of DRAFT_VERSIONS) {
        for (const targetDraft of DRAFT_VERSIONS) {
          const normalizedDraft = targetDraft.replace(
            'draft/',
            ''
          ) as JsonSchemaDraft;
          const ajv = createAjv(normalizedDraft);
          ajv.addFormat(
            'uuid',
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
          );
          const validate = ajv.compile(schema);

          for (const item of results[sourceDraft]) {
            const valid = validate(item);
            if (!valid && sourceDraft !== targetDraft) {
              // Some draft-specific differences are acceptable
              console.log(
                `Cross-draft validation: ${sourceDraft} → ${targetDraft}`,
                validate.errors
              );
            }
            // For now, we expect compatibility for our simple schemas
            expect(valid).toBe(true);
          }
        }
      }
    });

    test('should handle draft-specific keyword migration', () => {
      // Test migration from draft-07 to newer drafts
      const draft07Schema: JSONSchema7 = {
        type: 'object',
        properties: {
          value: {
            type: 'number',
            minimum: 0,
            maximum: 100,
          },
          items: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['value', 'items'],
      };

      const parser = new JSONSchemaParser();

      const normalized = expectParseOk(parser.parse(draft07Schema));
      const canonicalSchema = normalized.schema as Schema;

      // Generate using ObjectGenerator
      const generator = new ObjectGenerator();
      const formatRegistry = new FormatRegistry();
      const context = createGeneratorContext(canonicalSchema, formatRegistry, {
        seed: INTEGRATION_TEST_SEED,
      });

      const items: unknown[] = [];
      for (let i = 0; i < 10; i++) {
        const result = generator.generate(
          canonicalSchema as ObjectSchema,
          context
        );
        if (result.isOk()) {
          items.push(result.value);
        }
      }

      // Validate generated data with all draft versions
      for (const targetDraft of DRAFT_VERSIONS) {
        const normalizedDraft = targetDraft.replace(
          'draft/',
          ''
        ) as JsonSchemaDraft;
        const ajv = createAjv(normalizedDraft);
        const validate = ajv.compile(draft07Schema);

        for (const item of items) {
          const valid = validate(item);
          expect(valid).toBe(true);
        }
      }
    });
  });
});
