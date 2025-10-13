import { describe, it, expect } from 'vitest';
import { JSONSchemaParser } from '../json-schema-parser';

describe('JSONSchemaParser - additionalItems (strict)', () => {
  it('parses additionalItems: false with tuple', () => {
    const parser = new JSONSchemaParser();
    const input = {
      type: 'array',
      items: [{ type: 'string' }, { type: 'number' }],
      additionalItems: false,
    } as const;
    const r = parser.parse(input);
    expect(r.isOk()).toBe(true);
    if (!r.isOk()) return;
    const out = r.value.schema as any;
    expect(out.type).toBe('array');
    expect(Array.isArray(out.prefixItems)).toBe(true);
    expect(out.items).toBe(false);
  });

  it('parses additionalItems as schema for suffix', () => {
    const parser = new JSONSchemaParser();
    const input = {
      type: 'array',
      items: [{ type: 'string' }],
      additionalItems: { type: 'integer', minimum: 0 },
    } as const;
    const r = parser.parse(input);
    expect(r.isOk()).toBe(true);
    if (!r.isOk()) return;
    const out = r.value.schema as any;
    expect(out.type).toBe('array');
    expect(Array.isArray(out.prefixItems)).toBe(true);
    expect(out.items).toBeDefined();
    expect(out.items.type).toBe('integer');
    expect(out.items.minimum).toBe(0);
  });
});
