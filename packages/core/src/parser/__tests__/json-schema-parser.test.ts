import { describe, it, expect, beforeEach } from 'vitest';
/**
 * Tests for JSONSchemaParser
 */

import { JSONSchemaParser } from '../json-schema-parser';
import { getAjv } from '../../../../../test/helpers/ajv-factory';
import { ParseError } from '../../types/errors';
import type {
  ObjectSchema,
  StringSchema,
  NumberSchema,
  ArraySchema,
} from '../../types/schema';

describe('JSONSchemaParser', () => {
  let parser: JSONSchemaParser;

  beforeEach(() => {
    parser = new JSONSchemaParser();
  });

  describe('supports', () => {
    it('should support objects with type property', () => {
      expect(parser.supports({ type: 'string' })).toBe(true);
      expect(parser.supports({ type: 'object' })).toBe(true);
    });

    it('should support objects with $schema property', () => {
      expect(
        parser.supports({ $schema: 'http://json-schema.org/draft-07/schema#' })
      ).toBe(true);
    });

    it('should not support non-objects', () => {
      expect(parser.supports('string')).toBe(false);
      expect(parser.supports(null)).toBe(false);
      expect(parser.supports([])).toBe(false);
    });

    it('should not support objects without schema indicators', () => {
      expect(parser.supports({ random: 'object' })).toBe(false);
      expect(parser.supports({ description: 'just a description' })).toBe(
        false
      );
    });
  });

  describe('parse', () => {
    it('should parse basic string schema', () => {
      const input = { type: 'string', minLength: 5, maxLength: 10 };
      const result = parser.parse(input);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const schema = result.value as StringSchema;
        expect(schema.type).toBe('string');
        expect(schema.minLength).toBe(5);
        expect(schema.maxLength).toBe(10);
      }
    });

    it('should parse string schema with format', () => {
      const input = { type: 'string', format: 'email' };
      const result = parser.parse(input);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const schema = result.value as StringSchema;
        expect(schema.format).toBe('email');
      }
    });

    it('should parse number schema with constraints', () => {
      const input = { type: 'integer', minimum: 0, maximum: 100 };
      const result = parser.parse(input);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const schema = result.value as NumberSchema;
        expect(schema.type).toBe('integer');
        expect(schema.minimum).toBe(0);
        expect(schema.maximum).toBe(100);
      }
    });

    it('should parse object schema with properties', () => {
      const input = {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', minLength: 2 },
        },
        required: ['id'],
      };
      const result = parser.parse(input);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const schema = result.value as ObjectSchema;
        expect(schema.type).toBe('object');
        expect(schema.properties).toBeDefined();
        expect(schema.properties!.id).toBeDefined();
        expect(schema.required).toEqual(['id']);
      }
    });

    it('should parse additionalProperties as schema (object)', () => {
      const input = {
        type: 'object',
        additionalProperties: { type: 'string', minLength: 2 },
      };
      const result = parser.parse(input);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const schema = result.value as ObjectSchema;
        expect(schema.additionalProperties).toBeDefined();
        const ap = schema.additionalProperties as StringSchema;
        expect(ap.type).toBe('string');
        expect(ap.minLength).toBe(2);
      }
    });

    it('should enforce additionalProperties schema via AJV', () => {
      const input = {
        type: 'object',
        properties: {
          known: { type: 'number' },
        },
        additionalProperties: { type: 'string', minLength: 2 },
      } as const;

      const parsed = parser.parse(input);
      expect(parsed.isOk()).toBe(true);
      if (!parsed.isOk()) return;

      const ajv = getAjv();
      const validate = ajv.compile(parsed.value);

      // valid: additional props are strings len >= 2
      expect(validate({ known: 1, extra: 'ab', another: 'xyz' })).toBe(true);

      // invalid: too short
      expect(validate({ known: 1, extra: 'a' })).toBe(false);

      // invalid: wrong type
      expect(validate({ known: 1, extra: 123 })).toBe(false);
    });

    it('should parse array schema', () => {
      const input = {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 10,
      };
      const result = parser.parse(input);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const schema = result.value as ArraySchema;
        expect(schema.type).toBe('array');
        expect(schema.minItems).toBe(1);
        expect(schema.maxItems).toBe(10);
      }
    });

    it('should parse unevaluatedItems (boolean and schema)', () => {
      // boolean form
      const inputBool = {
        type: 'array',
        prefixItems: [{ type: 'string' }],
        unevaluatedItems: false,
      } as const;
      let result = parser.parse(inputBool);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const schema = result.value as ArraySchema;
        expect(schema.unevaluatedItems).toBe(false);
      }

      // schema form
      const inputSchema = {
        type: 'array',
        prefixItems: [{ type: 'string' }],
        unevaluatedItems: { type: 'number', minimum: 0 },
      } as const;
      result = parser.parse(inputSchema);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const schema = result.value as ArraySchema;
        expect(schema.unevaluatedItems).toBeDefined();
        const ui = schema.unevaluatedItems as NumberSchema;
        expect(ui.type).toBe('number');
        expect(ui.minimum).toBe(0);
      }
    });

    it('should parse base properties', () => {
      const input = {
        type: 'string',
        title: 'Name Field',
        description: 'User name',
        default: 'Anonymous',
        examples: ['John', 'Jane'],
      };
      const result = parser.parse(input);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const schema = result.value as StringSchema;
        expect(schema.title).toBe('Name Field');
        expect(schema.description).toBe('User name');
        expect(schema.default).toBe('Anonymous');
        expect(schema.examples).toEqual(['John', 'Jane']);
      }
    });

    it('should handle boolean schemas', () => {
      const result = parser.parse(true);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(true);
      }
    });

    it('should parse unevaluatedProperties (boolean and schema)', () => {
      // boolean form
      const inputBool = {
        type: 'object',
        properties: { id: { type: 'string' } },
        unevaluatedProperties: false,
      } as const;
      let result = parser.parse(inputBool);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const schema = result.value as ObjectSchema;
        expect((schema as any).unevaluatedProperties).toBe(false);
      }

      // schema form
      const inputSchema = {
        type: 'object',
        properties: { id: { type: 'string' } },
        unevaluatedProperties: { type: 'number', minimum: 0 },
      } as const;
      result = parser.parse(inputSchema);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const schema = result.value as ObjectSchema;
        const up = (schema as any).unevaluatedProperties as NumberSchema;
        expect(up.type).toBe('number');
        expect(up.minimum).toBe(0);
      }
    });
  });

  describe('error handling', () => {
    it('should return error for unsupported input', () => {
      const result = parser.parse({ notASchema: true });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(ParseError);
      }
    });

    it('should return error for missing type', () => {
      const result = parser.parse({
        $schema: 'http://json-schema.org/draft-07/schema#',
      });
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Cannot determine type');
      }
    });

    describe('pattern support', () => {
      it('should accept basic patterns', () => {
        const input = { type: 'string', pattern: '^[a-z]+$' };
        const result = parser.parse(input);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          const schema = result.value as StringSchema;
          expect(schema.pattern).toBe('^[a-z]+$');
        }
      });

      it('should accept simple patterns with character classes', () => {
        const patterns = [
          '^[A-Z]{3}$',
          '^[0-9]{4}$',
          '^[a-zA-Z0-9-]+$',
          '^[A-Z]{3}-[0-9]{4}$',
        ];

        for (const pattern of patterns) {
          const input = { type: 'string', pattern };
          const result = parser.parse(input);

          expect(result.isOk()).toBe(true);
          if (result.isOk()) {
            const schema = result.value as StringSchema;
            expect(schema.pattern).toBe(pattern);
          }
        }
      });

      it('should reject patterns with ReDoS vulnerabilities', () => {
        const dangerousPatterns = [
          '(a+)+',
          '(a*)*',
          '(a+)*',
          '(a*)+',
          '(a|a)+',
        ];

        for (const pattern of dangerousPatterns) {
          const input = { type: 'string', pattern };
          const result = parser.parse(input);

          expect(result.isErr()).toBe(true);
          if (result.isErr()) {
            expect(result.error.message).toContain('ReDoS-prone construct');
          }
        }
      });

      it('should reject patterns with complex features', () => {
        const complexPatterns = [
          '(?=.*[A-Z])', // positive lookahead
          '(?!foo)', // negative lookahead
          '(?<=\\d)', // positive lookbehind
          '(?<!\\w)', // negative lookbehind
          'test\\1', // backreferences
        ];

        for (const pattern of complexPatterns) {
          const input = { type: 'string', pattern };
          const result = parser.parse(input);

          expect(result.isErr()).toBe(true);
          if (result.isErr()) {
            expect(result.error.message).toContain('unsupported feature');
          }
        }
      });

      it('should reject patterns that are too long', () => {
        const longPattern = 'a'.repeat(1001);
        const input = { type: 'string', pattern: longPattern };
        const result = parser.parse(input);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.message).toContain('too long');
        }
      });

      it('should reject patterns with invalid syntax', () => {
        const invalidPatterns = [
          '[', // unclosed bracket
          '(', // unclosed group
          '?', // invalid quantifier
          '*', // invalid quantifier
        ];

        for (const pattern of invalidPatterns) {
          const input = { type: 'string', pattern };
          const result = parser.parse(input);

          expect(result.isErr()).toBe(true);
          if (result.isErr()) {
            expect(result.error.message).toContain('Invalid regex pattern');
          }
        }
      });
    });

    it('should accept $ref schemas', () => {
      const input = { $ref: '#/definitions/User' };
      const result = parser.parse(input);

      // $ref is now supported, so it should parse successfully
      // The actual resolution happens later in the pipeline
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual({ $ref: '#/definitions/User' });
      }
    });

    it('should return error for composition keywords', () => {
      const input = { allOf: [{ type: 'string' }, { minLength: 5 }] };
      const result = parser.parse(input);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Unsupported feature: "allOf"');
        expect(result.error.context?.suggestion).toContain(
          'Schema composition will be supported'
        );
      }
    });

    it('should accept nested objects up to depth 2', () => {
      const input = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              profile: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  age: { type: 'integer' },
                },
              },
              id: { type: 'string' },
            },
          },
        },
      };
      const result = parser.parse(input);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const schema = result.value as ObjectSchema;
        expect(schema.type).toBe('object');
        expect(schema.properties!.user).toBeDefined();
      }
    });

    it('should return error for deep nested objects (depth > 2)', () => {
      const input = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              profile: {
                type: 'object',
                properties: {
                  settings: {
                    type: 'object',
                    properties: {
                      theme: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const result = parser.parse(input);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain(
          'Deep nested objects (depth > 2) not supported'
        );
        expect(result.error.context?.suggestion).toContain(
          'Nested objects are supported up to depth 2'
        );
      }
    });

    it('should accept single level nested objects', () => {
      const input = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string', format: 'email' },
            },
          },
          settings: {
            type: 'object',
            properties: {
              theme: { type: 'string' },
            },
          },
        },
      };
      const result = parser.parse(input);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const schema = result.value as ObjectSchema;
        expect(schema.type).toBe('object');
        expect(schema.properties!.user).toBeDefined();
        expect(schema.properties!.settings).toBeDefined();
      }
    });

    it('should return error for conditional schemas', () => {
      const input = {
        if: { properties: { type: { const: 'premium' } } },
        then: { properties: { premium: { type: 'boolean' } } },
      };
      const result = parser.parse(input);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Unsupported feature: "if"');
      }
    });
  });

  describe('example schemas', () => {
    it('should parse quick-test-schema.json structure', () => {
      const input = {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', minLength: 2, maxLength: 30 },
          email: { type: 'string', format: 'email' },
          age: { type: 'integer', minimum: 18, maximum: 65 },
          premium: { type: 'boolean' },
        },
        required: ['id', 'email'],
      };

      const result = parser.parse(input);
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const schema = result.value as ObjectSchema;
        expect(schema.type).toBe('object');
        expect(Object.keys(schema.properties!)).toHaveLength(5);
        expect(schema.required).toEqual(['id', 'email']);
      }
    });
  });
});
