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

  it('collapses literal empty allOf to true and preserves pointer maps', () => {
    const schema = { allOf: [] };
    const result = normalize(schema);

    expect(result.schema).toBe(true);
    expect(result.ptrMap.get('')).toBe('/allOf');
    const rev = result.revPtrMap.get('/allOf');
    expect(rev).toBeDefined();
    expect(new Set(rev ?? []).has('')).toBe(true);
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

  it('sets root origin to /oneOf/0 when oneOf reduces to single', () => {
    const schema = {
      oneOf: [false, { type: 'string' }],
    };
    const result = normalize(schema);

    expect(result.schema).toEqual({ type: 'string' });
    // Root canon path maps to the normalized index 0 origin
    expect(result.ptrMap.get('')).toBe('/oneOf/0');
  });

  it('collapses anyOf containing true to true', () => {
    const schema = {
      anyOf: [{ type: 'number' }, true],
    };
    const result = normalize(schema);

    expect(result.schema).toBe(true);
    expect(result.ptrMap.get('')).toBe('/anyOf');
    expect(noteCodes(result)).toEqual([]);
  });

  it('does not introduce allOf when oneOf single true has siblings', () => {
    const schema = {
      minLength: 1,
      oneOf: [true],
    };
    const result = normalize(schema);

    expect(result.schema).toEqual({ minLength: 1 });
    // Ensure no allOf introduced
    expect((result.schema as any).allOf).toBeUndefined();
  });

  it('collapses to false when oneOf single false has siblings', () => {
    const schema = {
      minLength: 1,
      oneOf: [false],
    } as any;
    const result = normalize(schema);

    expect(result.schema).toBe(false);
    // Locus is the operator path
    expect(result.ptrMap.get('')).toBe('/oneOf');
  });

  it('does not introduce allOf when oneOf single empty-object has siblings', () => {
    const schema = {
      minLength: 2,
      oneOf: [{}],
    } as any;
    const result = normalize(schema);

    expect(result.schema).toEqual({ minLength: 2 });
    expect((result.schema as any).allOf).toBeUndefined();
  });

  it('collapses allOf containing false to false with operator origin', () => {
    const schema = {
      allOf: [{ type: 'string' }, false],
    };
    const result = normalize(schema);

    expect(result.schema).toBe(false);
    expect(result.ptrMap.get('')).toBe('/allOf');
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

  it('collapses literal empty anyOf to false and preserves pointer maps', () => {
    const schema = { anyOf: [] };
    const result = normalize(schema);

    expect(result.schema).toBe(false);
    expect(result.ptrMap.get('')).toBe('/anyOf');
    const rev = result.revPtrMap.get('/anyOf');
    expect(rev).toBeDefined();
    expect(new Set(rev ?? []).has('')).toBe(true);
  });

  it('collapses literal empty oneOf to false and preserves pointer maps', () => {
    const schema = { oneOf: [] };
    const result = normalize(schema);

    expect(result.schema).toBe(false);
    expect(result.ptrMap.get('')).toBe('/oneOf');
    const rev = result.revPtrMap.get('/oneOf');
    expect(rev).toBeDefined();
    expect(new Set(rev ?? []).has('')).toBe(true);
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

  it('skips rewrite when generated not depth would exceed guard limit', () => {
    const schema = {
      if: ifSchema,
      then: thenSchema,
      else: elseSchema,
    };
    const result = normalize(schema, {
      rewriteConditionals: 'safe',
      guards: { maxGeneratedNotNesting: 1 },
    });

    expect(result.schema).toEqual(schema);
    const note = findNote(result, DIAGNOSTIC_CODES.NOT_DEPTH_CAPPED);
    expect(note).toBeDefined();
    expect(note?.canonPath).toBe('/if');
  });

  it('emits IF_REWRITE_DISABLED_ANNOTATION_RISK when annotation keywords are present in the owning object', () => {
    const schema = {
      type: 'object',
      properties: {
        kind: { const: 'A' },
      },
      if: ifSchema,
      then: thenSchema,
      else: elseSchema,
    };

    const result = normalize(schema, { rewriteConditionals: 'safe' });

    expect(result.schema).toEqual(schema);
    const note = findNote(
      result,
      DIAGNOSTIC_CODES.IF_REWRITE_DISABLED_ANNOTATION_RISK
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

  it('records UNEVALUATED_IN_SCOPE when propertyNames rewrite is guarded', () => {
    const schema = {
      unevaluatedProperties: false,
      propertyNames: {
        enum: ['a'],
      },
    };

    const result = normalize(schema);

    expect(result.schema).toEqual({
      unevaluatedProperties: false,
      propertyNames: { const: 'a' },
    });
    const note = findNote(result, DIAGNOSTIC_CODES.PNAMES_COMPLEX);
    expect(note).toBeDefined();
    expect(note?.canonPath).toBe('');
    expect(note?.details).toEqual({ reason: 'UNEVALUATED_IN_SCOPE' });
  });

  it('emits PNAMES_COMPLEX with reason PATTERN_PROPERTIES_PRESENT when patternProperties is non-empty', () => {
    const schema = {
      propertyNames: { enum: ['a', 'b'] },
      patternProperties: {
        '^x$': { type: 'number' },
      },
    } as const;

    const result = normalize(schema);

    // No rewrite should happen; existing patternProperties remains
    expect(result.schema).toEqual(schema);

    const note = findNote(result, DIAGNOSTIC_CODES.PNAMES_COMPLEX);
    expect(note).toBeDefined();
    expect(note?.canonPath).toBe('');
    expect(note?.details).toEqual({ reason: 'PATTERN_PROPERTIES_PRESENT' });

    // No PNAMES_REWRITE_APPLIED should be emitted
    const applied = findNote(result, DIAGNOSTIC_CODES.PNAMES_REWRITE_APPLIED);
    expect(applied).toBeUndefined();
  });

  it('emits PNAMES_COMPLEX with reason ADDITIONAL_PROPERTIES_SCHEMA when additionalProperties is a schema', () => {
    const schema = {
      propertyNames: { enum: ['a', 'b'] },
      additionalProperties: { type: 'string' },
    } as const;

    const result = normalize(schema);

    // No rewrite; additionalProperties schema blocks acceptance
    expect(result.schema).toEqual(schema);

    const note = findNote(result, DIAGNOSTIC_CODES.PNAMES_COMPLEX);
    expect(note).toBeDefined();
    expect(note?.canonPath).toBe('');
    expect(note?.details).toEqual({ reason: 'ADDITIONAL_PROPERTIES_SCHEMA' });
  });

  it('deduplicates and sorts enum for pattern (UTF-16 order) when rewriting', () => {
    const schema = {
      type: 'object',
      properties: { a: {} },
      required: ['a'],
      propertyNames: { enum: ['b', 'a', 'a', 'c'] },
    };

    const result = normalize(schema);

    // Expect acceptance rewrite with sorted dedup pattern
    expect(result.schema).toEqual({
      type: 'object',
      properties: { a: {} },
      required: ['a'],
      propertyNames: { enum: ['b', 'a', 'a', 'c'] },
      patternProperties: { '^(?:a|b|c)$': {} },
      additionalProperties: false,
    });

    const note = findNote(result, DIAGNOSTIC_CODES.PNAMES_REWRITE_APPLIED);
    expect(note).toBeDefined();
    expect(note?.canonPath).toBe('');
    expect(note?.details).toEqual({ kind: 'enum', source: '^(?:a|b|c)$' });
  });

  it('revPtrMap of propertyNames includes synthetic patternProperties and additionalProperties pointers', () => {
    const schema = {
      type: 'object',
      properties: { a: {} },
      required: ['a'],
      propertyNames: { enum: ['a', 'b'] },
    };

    const result = normalize(schema);
    const rev = result.revPtrMap;
    const fromPnames = rev.get('/propertyNames');
    expect(fromPnames).toBeDefined();

    const set = new Set(fromPnames ?? []);
    expect(set.has('/patternProperties')).toBe(true);
    expect(set.has('/patternProperties/^(?:a|b)$')).toBe(true);
    expect(set.has('/additionalProperties')).toBe(true);
  });

  it('adds synthetic entries for anchored propertyNames.pattern rewrites', () => {
    const schema = {
      type: 'object',
      properties: { foo: {}, bar: {} },
      required: ['foo'],
      propertyNames: { pattern: '^(?:foo|bar)$' },
    };

    const result = normalize(schema);
    expect(result.schema).toEqual({
      type: 'object',
      properties: { foo: {}, bar: {} },
      required: ['foo'],
      propertyNames: { pattern: '^(?:foo|bar)$' },
      patternProperties: {
        '^(?:foo|bar)$': {},
      },
      additionalProperties: false,
    });
    const note = findNote(result, DIAGNOSTIC_CODES.PNAMES_REWRITE_APPLIED);
    expect(note).toBeDefined();
    expect(note?.details).toEqual({
      kind: 'pattern',
      source: '^(?:foo|bar)$',
    });
  });

  it('refuses pattern rewrite when regex is not anchored-safe', () => {
    const schema = {
      type: 'object',
      propertyNames: { pattern: '^foo' },
    };

    const result = normalize(schema);
    expect(result.schema).toEqual(schema);
    const note = findNote(result, DIAGNOSTIC_CODES.PNAMES_COMPLEX);
    expect(note?.details).toEqual({ reason: 'PATTERN_NOT_ANCHORED' });
  });

  it('refuses pattern rewrite when patternProperties already exist', () => {
    const schema = {
      propertyNames: { pattern: '^[ab]$' },
      patternProperties: { '^x$': {} },
    };

    const result = normalize(schema);
    expect(result.schema).toEqual(schema);
    const note = findNote(result, DIAGNOSTIC_CODES.PNAMES_COMPLEX);
    expect(note?.details).toEqual({ reason: 'PATTERN_PROPERTIES_PRESENT' });
  });

  it('emits compile diagnostics when propertyNames.pattern fails to compile', () => {
    const schema = {
      propertyNames: { pattern: '^(foo$' },
    };

    const result = normalize(schema);
    expect(result.schema).toEqual(schema);
    const complex = findNote(result, DIAGNOSTIC_CODES.PNAMES_COMPLEX);
    expect(complex?.details).toEqual({ reason: 'REGEX_COMPILE_ERROR' });
    const regex = findNote(result, DIAGNOSTIC_CODES.REGEX_COMPILE_ERROR);
    expect(regex?.details).toEqual({
      context: 'rewrite',
      patternSource: '^(foo$',
    });
  });

  it('emits PNAMES_COMPLEX when required contains non-string entries', () => {
    const schema = {
      propertyNames: { enum: ['a', 'b'] },
      required: ['a', 1] as any,
    };

    const result = normalize(schema);

    expect(result.schema).toEqual(schema);
    const note = findNote(result, DIAGNOSTIC_CODES.PNAMES_COMPLEX);
    expect(note).toBeDefined();
    expect(note?.canonPath).toBe('');
    expect(note?.details).toEqual({ reason: 'REQUIRED_KEYS_NOT_COVERED' });
  });

  it('emits REGEX_COMPLEXITY_CAPPED with context "rewrite" when constructed pattern exceeds cap', () => {
    // Use two distinct very-long names so enum is not normalized to const
    const veryLongA = 'a'.repeat(3100);
    const veryLongB = 'b'.repeat(3100);
    const schema = {
      propertyNames: {
        enum: [veryLongA, veryLongB],
      },
    };

    const result = normalize(schema);

    // No coverage-expanding rewrite should occur under complexity cap
    // (Note: enum size-1 normalization to const is allowed in canonical view)
    const canon = result.schema as any;
    expect(canon.patternProperties).toBeUndefined();
    expect(canon.additionalProperties).toBeUndefined();
    expect(canon.propertyNames).toBeDefined();
    expect(canon.propertyNames.enum).toEqual([veryLongA, veryLongB]);

    // PNAMES complexity reason is propagated
    const pnames = findNote(result, DIAGNOSTIC_CODES.PNAMES_COMPLEX);
    expect(pnames).toBeDefined();
    expect(pnames?.canonPath).toBe(''); // owning object locus
    expect(pnames?.details).toEqual({ reason: 'REGEX_COMPLEXITY_CAPPED' });

    // A regex cap note with context:"rewrite" must be present
    const regex = findNote(result, DIAGNOSTIC_CODES.REGEX_COMPLEXITY_CAPPED);
    expect(regex).toBeDefined();
    expect(regex?.canonPath).toBe(''); // owning object locus
    const details = (regex?.details ?? {}) as {
      context?: string;
      patternSource?: string;
    };
    expect(details.context).toBe('rewrite');
    expect(typeof details.patternSource).toBe('string');
    expect((details.patternSource ?? '').length).toBeGreaterThan(4096);
  });

  it('emits PNAMES_COMPLEX with reason REQUIRED_KEYS_NOT_COVERED and lists missingRequired', () => {
    const schema = {
      type: 'object',
      properties: { a: {}, b: {} },
      required: ['a', 'c'],
      propertyNames: { enum: ['b', 'd'] },
    };

    const result = normalize(schema);

    // No rewrite should occur; guarding behavior triggers complexity note
    const canon = result.schema as any;
    expect(canon.patternProperties).toBeUndefined();
    expect(canon.additionalProperties).toBeUndefined();
    expect(canon.propertyNames).toEqual({ enum: ['b', 'd'] });

    const note = findNote(result, DIAGNOSTIC_CODES.PNAMES_COMPLEX);
    expect(note).toBeDefined();
    expect(note?.canonPath).toBe('');
    expect(note?.details).toEqual({
      reason: 'REQUIRED_KEYS_NOT_COVERED',
      missingRequired: ['a', 'c'],
    });
  });
});

describe('SchemaNormalizer – local definitions $ref rewrite', () => {
  it('rewrites #/definitions/... to #/$defs/... when target exists and preserves origins', () => {
    const schema = {
      definitions: {
        Foo: { type: 'string' },
      },
      $ref: '#/definitions/Foo',
    } as const;

    const result = normalize(schema);

    expect(result.schema).toEqual({
      $defs: {
        Foo: { type: 'string' },
      },
      $ref: '#/$defs/Foo',
    });

    // $ref origin remains at '/$ref' after rewrite
    expect(result.ptrMap.get('/$ref')).toBe('/$ref');
    // Child origin inside $defs preserves original '/definitions/...'
    expect(result.ptrMap.get('/$defs/Foo/type')).toBe('/definitions/Foo/type');

    const rev = result.revPtrMap.get('/definitions/Foo/type');
    expect(rev).toBeDefined();
    expect(new Set(rev ?? []).has('/$defs/Foo/type')).toBe(true);
  });

  it('emits DEFS_TARGET_MISSING and preserves original $ref when target not found', () => {
    const schema = {
      $ref: '#/definitions/Missing',
    } as const;

    const result = normalize(schema);
    expect(result.schema).toEqual(schema);

    const note = findNote(result, DIAGNOSTIC_CODES.DEFS_TARGET_MISSING);
    expect(note).toBeDefined();
    expect(note?.canonPath).toBe('/$ref');
    expect(note?.details).toEqual({ target: '#/$defs/Missing' });
  });
});

describe('SchemaNormalizer – dependentRequired guards', () => {
  it('expands dependentRequired into allOf guards when safe', () => {
    const schema = {
      type: 'object',
      properties: {
        foo: { type: 'number' },
        bar: { type: 'string' },
      },
      dependentRequired: {
        foo: ['bar'],
      },
    };

    const result = normalize(schema);

    expect(result.schema).toEqual({
      type: 'object',
      properties: {
        foo: { type: 'number' },
        bar: { type: 'string' },
      },
      dependentRequired: {
        foo: ['bar'],
      },
      allOf: [
        {
          anyOf: [
            {
              not: {
                required: ['foo'],
              },
            },
            {
              required: ['foo', 'bar'],
            },
          ],
        },
      ],
    });

    expect(result.ptrMap.get('/allOf/0/anyOf/0/not/required')).toBe(
      '/dependentRequired/foo'
    );
    expect(result.ptrMap.get('/allOf/0/anyOf/1/required')).toBe(
      '/dependentRequired/foo'
    );
    const note = findNote(result, DIAGNOSTIC_CODES.DEPENDENCY_GUARDED);
    expect(note).toBeUndefined();
  });

  it('skips dependentRequired rewrite under unevaluated guard', () => {
    const schema = {
      unevaluatedProperties: false,
      dependentRequired: {
        foo: ['bar'],
      },
    };

    const result = normalize(schema);

    expect(result.schema).toEqual(schema);
    const note = findNote(result, DIAGNOSTIC_CODES.DEPENDENCY_GUARDED);
    expect(note).toBeDefined();
    expect(note?.canonPath).toBe('');
    expect(note?.details).toEqual({ reason: 'UNEVALUATED_IN_SCOPE' });
  });
});

describe('SchemaNormalizer – dynamic keywords', () => {
  it('emits DYNAMIC_PRESENT when dynamic references are present', () => {
    const schema = {
      $dynamicRef: '#foo',
      $ref: '#/defs/foo',
      $dynamicAnchor: 'foo',
    };

    const result = normalize(schema);

    expect(result.schema).toEqual(schema);
    const note = findNote(result, DIAGNOSTIC_CODES.DYNAMIC_PRESENT);
    expect(note).toBeDefined();
    expect(note?.canonPath).toBe('');
  });
});
