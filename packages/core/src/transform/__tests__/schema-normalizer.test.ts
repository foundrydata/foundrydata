import { describe, it, expect } from 'vitest';
import { normalize } from '../schema-normalizer';
import { DIAGNOSTIC_CODES } from '../../diag/codes';

function noteCodes(result: ReturnType<typeof normalize>): string[] {
  return result.notes.map((note) => note.code);
}

function findNote(
  result: ReturnType<typeof normalize>,
  code: string
): { canonPath: string; details?: unknown } | undefined {
  const note = result.notes.find((n) => n.code === code);
  return note
    ? { canonPath: note.canonPath, details: note.details }
    : undefined;
}

describe('SchemaNormalizer – boolean simplifications', () => {
  it('collapses allOf [] to true', () => {
    const schema = { allOf: [true, true] };
    const result = normalize(schema);

    expect(result.schema).toBe(true);
    expect(Array.from(result.ptrMap.entries())).toContainEqual(['', '/allOf']);
    expect(noteCodes(result)).toEqual([]);
  });

  it('inlines oneOf single schema after removing false', () => {
    const schema = {
      oneOf: [false, { type: 'string', minLength: 3 }],
    };
    const result = normalize(schema);

    expect(result.schema).toEqual({ type: 'string', minLength: 3 });
    expect(result.ptrMap.get('/type')).toBe('/oneOf/1/type');
    expect(result.ptrMap.get('/minLength')).toBe('/oneOf/1/minLength');
    expect(noteCodes(result)).toEqual([]);
  });

  it('collapses anyOf containing true to true', () => {
    const schema = {
      anyOf: [{ type: 'number' }, true],
    };
    const result = normalize(schema);

    expect(result.schema).toBe(true);
    expect(result.ptrMap.get('')).toBe('/anyOf/1');
    expect(noteCodes(result)).toEqual([]);
  });

  it('skips simplification when unevaluatedProperties present and emits note', () => {
    const schema = {
      unevaluatedProperties: false,
      anyOf: [false, { type: 'string' }],
    };
    const result = normalize(schema);

    expect(result.schema).toEqual(schema);
    const note = findNote(
      result,
      DIAGNOSTIC_CODES.ANYOF_SIMPLIFICATION_SKIPPED_UNEVALUATED
    );
    expect(note).toBeDefined();
    expect(note?.canonPath).toBe('/anyOf');
    expect(note?.details).toEqual({ reason: 'unevaluatedInScope' });
  });
});

describe('SchemaNormalizer – draft unification', () => {
  it('converts draft-04 exclusiveMinimum boolean to numeric and removes minimum', () => {
    const schema = {
      minimum: 5,
      exclusiveMinimum: true,
    };
    const result = normalize(schema);

    expect(result.schema).toEqual({
      exclusiveMinimum: 5,
    });
    expect(result.ptrMap.get('/exclusiveMinimum')).toBe('/minimum');
    expect(noteCodes(result)).toEqual([]);
  });

  it('emits note when exclusiveMaximum lacks corresponding maximum', () => {
    const schema = {
      exclusiveMaximum: true,
    };
    const result = normalize(schema);

    expect(result.schema).toEqual({});
    const note = findNote(result, DIAGNOSTIC_CODES.EXCLMAX_IGNORED_NO_MAX);
    expect(note).toBeDefined();
    expect(note?.canonPath).toBe('/exclusiveMaximum');
  });
});

describe('SchemaNormalizer – conditional rewrite', () => {
  const ifSchema = {
    properties: {
      kind: { const: 'A' },
    },
    required: ['kind'],
  };
  const thenSchema = {
    required: ['a1'],
  };
  const elseSchema = {
    required: ['a2'],
  };

  it('rewrites safe conditionals to anyOf double-negation form', () => {
    const schema = {
      if: ifSchema,
      then: thenSchema,
      else: elseSchema,
    };
    const result = normalize(schema, { rewriteConditionals: 'safe' });

    expect(result.schema).toEqual({
      anyOf: [
        {
          allOf: [{ not: { not: ifSchema } }, thenSchema],
        },
        {
          allOf: [{ not: ifSchema }, elseSchema],
        },
      ],
    });

    expect(result.ptrMap.get('/anyOf')).toBe('/if');
    expect(result.ptrMap.get('/anyOf/0/allOf/0/not')).toBe('/if');
    const note = findNote(result, DIAGNOSTIC_CODES.IF_REWRITE_DOUBLE_NOT);
    expect(note).toBeDefined();
    expect(note?.canonPath).toBe('/if');
  });

  it('skips rewrite when unevaluatedProperties guard applies', () => {
    const schema = {
      unevaluatedProperties: false,
      if: ifSchema,
      then: thenSchema,
      else: elseSchema,
    };
    const result = normalize(schema, { rewriteConditionals: 'safe' });

    expect(result.schema).toEqual(schema);
    const note = findNote(
      result,
      DIAGNOSTIC_CODES.IF_REWRITE_SKIPPED_UNEVALUATED
    );
    expect(note).toBeDefined();
    expect(note?.canonPath).toBe('/if');
  });
});

describe('SchemaNormalizer – propertyNames rewrite', () => {
  it('adds synthetic patternProperties and AP:false for enum rewrite', () => {
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'string' },
      },
      required: ['a'],
      propertyNames: {
        enum: ['a', 'b'],
      },
    };

    const result = normalize(schema);

    expect(result.schema).toEqual({
      type: 'object',
      properties: {
        a: { type: 'string' },
      },
      required: ['a'],
      propertyNames: {
        enum: ['a', 'b'],
      },
      patternProperties: {
        '^(?:a|b)$': {},
      },
      additionalProperties: false,
    });

    expect(result.ptrMap.get('/patternProperties')).toBe('/propertyNames');
    expect(result.ptrMap.get('/patternProperties/^(?:a|b)$')).toBe(
      '/propertyNames'
    );
    expect(result.ptrMap.get('/additionalProperties')).toBe('/propertyNames');

    const note = findNote(result, DIAGNOSTIC_CODES.PNAMES_REWRITE_APPLIED);
    expect(note).toBeDefined();
    expect(note?.canonPath).toBe('');
    expect(note?.details).toEqual({
      kind: 'enum',
      source: '^(?:a|b)$',
    });
  });

  it('emits PNAMES_COMPLEX when enum includes non-string member', () => {
    const schema = {
      propertyNames: {
        enum: ['a', 1],
      },
    };
    const result = normalize(schema);

    expect(result.schema).toEqual(schema);
    const note = findNote(result, DIAGNOSTIC_CODES.PNAMES_COMPLEX);
    expect(note).toBeDefined();
    expect(note?.canonPath).toBe('');
    expect(note?.details).toEqual({ reason: 'NON_STRING_ENUM_MEMBER' });
  });
});
