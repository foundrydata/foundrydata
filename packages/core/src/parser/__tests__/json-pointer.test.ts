import { describe, it, expect } from 'vitest';
import { JSONSchemaParser } from '../json-schema-parser';

describe('JSONSchemaParser pointer mapping', () => {
  it('records canonical pointers for nested properties', () => {
    const parser = new JSONSchemaParser();
    const schema = {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 2 },
          },
        },
      },
    } as const;

    const result = parser.parse(schema);
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;

    const ptrMap = result.value.ptrMap;
    expect(ptrMap.get('/properties/user/properties/name/type')).toBe(
      '/properties/user/properties/name/type'
    );
    expect(ptrMap.get('/properties/user/properties/name/minLength')).toBe(
      '/properties/user/properties/name/minLength'
    );
  });

  it('records pointers with array indices for prefixItems', () => {
    const parser = new JSONSchemaParser();
    const schema = {
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: 'number' }],
    } as const;

    const result = parser.parse(schema);
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;

    const ptrMap = result.value.ptrMap;
    expect(ptrMap.get('/prefixItems/0/type')).toBe('/prefixItems/0/type');
    expect(ptrMap.get('/prefixItems/1/type')).toBe('/prefixItems/1/type');
  });

  it('escapes ~ and / in property names within pointer map', () => {
    const parser = new JSONSchemaParser();
    const schema = {
      type: 'object',
      properties: {
        'a~b/x': {
          type: 'string',
        },
      },
    } as const;

    const result = parser.parse(schema);
    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;

    const ptrMap = result.value.ptrMap;
    expect(ptrMap.get('/properties/a~0b~1x/type')).toBe(
      '/properties/a~0b~1x/type'
    );
  });
});
