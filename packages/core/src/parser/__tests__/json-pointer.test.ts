import { describe, it, expect } from 'vitest';
import { JSONSchemaParser } from '../json-schema-parser';

describe('JSONSchemaParser.toSchemaPointer (RFC 6901)', () => {
  it('produces pointer for nested property pattern errors', () => {
    const parser = new JSONSchemaParser();
    const schema = {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            name: { type: 'string', pattern: '(' }, // invalid regex
          },
        },
      },
    } as const;

    const res = parser.parse(schema);
    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      const ctx = res.error.context || {};
      expect(ctx.schemaPath).toBe('#/properties/user/properties/name/pattern');
    }
  });

  it('produces pointer with array index for prefixItems[...] paths', () => {
    const parser = new JSONSchemaParser();
    const schema = {
      type: 'array',
      prefixItems: [
        {
          type: 'string',
          // invalid property for type string to force error and capture pointer
          minItems: 1,
        },
      ],
    } as const;

    const res = parser.parse(schema);
    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      const ctx = res.error.context || {};
      expect(ctx.schemaPath).toBe('#/prefixItems/0/minItems');
    }
  });

  it('escapes ~ and / in property names', () => {
    const parser = new JSONSchemaParser();
    const schema = {
      type: 'object',
      properties: {
        'a~b/x': {
          type: 'string',
          // invalid property for string to trigger pointer
          minItems: 1,
        },
      },
    } as const;

    const res = parser.parse(schema);
    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      const ctx = res.error.context || {};
      expect(ctx.schemaPath).toBe('#/properties/a~0b~1x/minItems');
    }
  });
});
