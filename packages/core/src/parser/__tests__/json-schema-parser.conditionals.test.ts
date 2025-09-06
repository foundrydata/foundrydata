import { describe, it, expect } from 'vitest';
import { JSONSchemaParser } from '../json-schema-parser';

describe('JSONSchemaParser - conditionals if/then/else (strict)', () => {
  it('parses simple if/then', () => {
    const parser = new JSONSchemaParser();
    const input = {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['A', 'B'] },
      },
      if: { properties: { kind: { const: 'A' } } },
      then: { required: ['foo'], properties: { foo: { type: 'string' } } },
    } as const;

    const r = parser.parse(input);
    expect(r.isOk()).toBe(true);
    if (!r.isOk()) return;
    const out = r.value as any;
    expect(out.if).toBeDefined();
    expect(out.then).toBeDefined();
    expect(out.else).toBeUndefined();
  });

  it('parses if/then/else trio', () => {
    const parser = new JSONSchemaParser();
    const input = {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['A', 'B'] },
      },
      if: { properties: { kind: { const: 'A' } } },
      then: { required: ['foo'], properties: { foo: { type: 'string' } } },
      else: { required: ['bar'], properties: { bar: { type: 'number' } } },
    } as const;

    const r = parser.parse(input);
    expect(r.isOk()).toBe(true);
    if (!r.isOk()) return;
    const out = r.value as any;
    expect(out.if).toBeDefined();
    expect(out.then).toBeDefined();
    expect(out.else).toBeDefined();
  });
});
