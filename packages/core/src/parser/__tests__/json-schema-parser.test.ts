import { describe, it, expect, beforeEach } from 'vitest';
import { JSONSchemaParser } from '../json-schema-parser';
import type { NormalizeResult } from '../../transform/schema-normalizer';
import type { Result } from '../../types/result';
import { ParseError } from '../../types/errors';
import { ErrorCode } from '../../errors/codes';

type ParseResult = Result<NormalizeResult, ParseError>;

function expectOk(result: ParseResult): NormalizeResult {
  expect(result.isOk()).toBe(true);
  if (!result.isOk()) {
    throw result.error;
  }
  return result.value;
}

describe('JSONSchemaParser', () => {
  let parser: JSONSchemaParser;

  beforeEach(() => {
    parser = new JSONSchemaParser();
  });

  describe('supports', () => {
    it('accepts boolean schemas', () => {
      expect(parser.supports(true)).toBe(true);
      expect(parser.supports(false)).toBe(true);
    });

    it('accepts objects with schema indicators', () => {
      expect(parser.supports({ type: 'string' })).toBe(true);
      expect(parser.supports({ $ref: '#/defs/x' })).toBe(true);
      expect(parser.supports({ properties: {} })).toBe(true);
    });

    it('rejects non-schema inputs', () => {
      expect(parser.supports('schema')).toBe(false);
      expect(parser.supports(null)).toBe(false);
      expect(parser.supports([])).toBe(false);
      expect(parser.supports({ description: 'just text' })).toBe(false);
    });
  });

  describe('parse success cases', () => {
    it('normalizes a basic object schema', () => {
      const input = {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
        additionalItems: { type: 'number' },
      };

      const normalized = expectOk(parser.parse(input));
      const schema = normalized.schema as Record<string, unknown>;

      expect(schema).toMatchObject({
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      });
      expect(normalized.ptrMap.get('')).toBe('');
      expect(normalized.ptrMap.get('/properties/id/type')).toBe(
        '/properties/id/type'
      );
    });

    it('delegates canonicalization to the normalizer', () => {
      const input = {
        type: 'array',
        items: [{ type: 'string' }],
        additionalItems: false,
      };

      const normalized = expectOk(parser.parse(input));
      const schema = normalized.schema as Record<string, unknown>;

      expect(schema).toMatchObject({
        type: 'array',
        prefixItems: [{ type: 'string' }],
        items: false,
      });
      expect(normalized.ptrMap.get('/items')).toBe('/additionalItems');
    });

    it('parses boolean schemas', () => {
      const normalized = expectOk(parser.parse(true));
      expect(normalized.schema).toBe(true);
      expect(normalized.ptrMap.get('')).toBe('');
    });
  });

  describe('parse error cases', () => {
    it('fails fast for inputs without schema indicators', () => {
      const result = parser.parse({ description: 'no indicators' });
      expect(result.isErr()).toBe(true);
      if (!result.isErr()) return;
      expect(result.error).toBeInstanceOf(ParseError);
      expect(result.error.errorCode).toBe(ErrorCode.SCHEMA_PARSE_FAILED);
      expect(result.error.context?.schemaPath).toBe('#');
    });

    it('rejects functions in schemas', () => {
      const result = parser.parse({
        type: 'object',
        default: () => 'nope',
      });

      expect(result.isErr()).toBe(true);
      if (!result.isErr()) return;
      expect(result.error.errorCode).toBe(ErrorCode.SCHEMA_PARSE_FAILED);
      expect(result.error.context?.schemaPath).toBe('#/default');
    });

    it('rejects BigInt instances', () => {
      const result = parser.parse({
        type: 'number',
        minimum: BigInt(0),
      });

      expect(result.isErr()).toBe(true);
      if (!result.isErr()) return;
      expect(result.error.errorCode).toBe(ErrorCode.SCHEMA_PARSE_FAILED);
      expect(result.error.context?.schemaPath).toBe('#/minimum');
    });

    it('rejects undefined values', () => {
      const result = parser.parse({
        type: 'object',
        default: undefined,
      });

      expect(result.isErr()).toBe(true);
      if (!result.isErr()) return;
      expect(result.error.errorCode).toBe(ErrorCode.SCHEMA_PARSE_FAILED);
      expect(result.error.context?.schemaPath).toBe('#/default');
    });

    it('detects circular references', () => {
      const schema: any = { type: 'object' };
      schema.properties = { self: schema };

      const result = parser.parse(schema);
      expect(result.isErr()).toBe(true);
      if (!result.isErr()) return;
      expect(result.error.errorCode).toBe(
        ErrorCode.CIRCULAR_REFERENCE_DETECTED
      );
      expect(result.error.context?.schemaPath).toBe('#/properties/self');
    });
  });
});
