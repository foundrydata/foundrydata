import { describe, expect, it } from 'vitest';

import { normalizeSchema } from './test-helpers.js';

describe('§7 Normalizer pointer binding', () => {
  it('T-PTR-ALLOF-RENORM-01 compacts neutral allOf branches', () => {
    const schema = {
      allOf: [true, { type: 'string', title: 'S' }, true],
    };

    const result = normalizeSchema(schema);
    const normalized = result.schema as Record<string, unknown>;

    const allOf = normalized.allOf as unknown[];
    expect(Array.isArray(allOf)).toBe(true);
    expect(allOf).toHaveLength(1);
    expect(allOf[0]).toMatchObject({ type: 'string', title: 'S' });

    expect(result.ptrMap.get('/allOf/0')).toBe('/allOf/1');
    const indexNotes = result.notes.filter(
      (note) => note.canonPath === '/allOf/0'
    );
    expect(indexNotes).toHaveLength(0);
  });

  it('T-PTR-ONEOF-SIZE1-01 collapses single-branch oneOf into const', () => {
    const schema = {
      oneOf: [{ const: 1 }],
    };

    const result = normalizeSchema(schema);
    const normalized = result.schema as Record<string, unknown>;

    expect(normalized).toEqual({ const: 1 });
    expect(result.ptrMap.get('/const')).toBe('/oneOf/0/const');
    expect(result.ptrMap.has('/oneOf/0')).toBe(false);
  });

  it('T-PTR-PNAMES-SYN-01 rewrites propertyNames enum with synthetic provenance', () => {
    const schema = {
      type: 'object',
      propertyNames: {
        enum: ['beta', 'alpha', 'alpha'],
      },
    };

    const result = normalizeSchema(schema);
    const normalized = result.schema as Record<string, unknown>;

    expect(normalized).toMatchObject({
      type: 'object',
      patternProperties: {
        '^(?:alpha|beta)$': {},
      },
      additionalProperties: false,
    });

    expect(result.ptrMap.get('/patternProperties/^(?:alpha|beta)$')).toBe(
      '/propertyNames'
    );
    expect(result.ptrMap.get('/additionalProperties')).toBe('/propertyNames');
    const revMap = result.revPtrMap.get('/propertyNames') ?? [];
    expect(revMap).toEqual(
      expect.arrayContaining([
        '/patternProperties/^(?:alpha|beta)$',
        '/additionalProperties',
      ])
    );
  });
});
