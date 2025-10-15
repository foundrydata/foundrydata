/* eslint-disable complexity */
import { describe, it, expect } from 'vitest';

import { DIAGNOSTIC_CODES } from '../../diag/codes';
import {
  compose,
  computeSelectorMemoKey,
  type ComposeInput,
} from '../composition-engine';
import type { NormalizerNote } from '../schema-normalizer';

function makeInput(
  schema: unknown,
  notes: NormalizerNote[] = [],
  ptrEntries: Array<[string, string]> = []
): ComposeInput {
  const ptrMap = new Map<string, string>(ptrEntries);
  const revPtrMap = new Map<string, string[]>();
  for (const [canon, origin] of ptrEntries) {
    const existing = revPtrMap.get(origin);
    if (existing) {
      existing.push(canon);
      existing.sort();
    } else {
      revPtrMap.set(origin, [canon]);
    }
  }
  return {
    schema,
    ptrMap,
    revPtrMap,
    notes,
  };
}

describe('computeSelectorMemoKey', () => {
  it('stabilizes ajv flag ordering and plan options snapshot', () => {
    const key = computeSelectorMemoKey({
      canonPath: '/oneOf',
      seed: 123,
      planOptions: {
        trials: { perBranch: 3 },
      },
      userKey: 'custom-key',
      ajvMetadata: {
        ajvMajor: 8,
        ajvClass: 'Ajv2020',
        ajvFlags: { removeAdditional: 'all', strict: false },
      },
    });

    const parsed = JSON.parse(key);
    expect(parsed).toMatchObject({
      canonPath: '/oneOf',
      seed: 123,
      ajvMajor: 8,
      ajvClass: 'Ajv2020',
      userKey: 'custom-key',
    });
    expect(parsed.ajvFlags).toEqual({
      removeAdditional: 'all',
      strict: false,
    });
    expect(typeof parsed.planOptionsSubKey).toBe('string');
    expect(parsed.planOptionsSubKey.length).toBeGreaterThan(0);
  });

  it('fills default metadata when optional fields are omitted', () => {
    const key = computeSelectorMemoKey({
      canonPath: '',
      seed: -1,
    });
    const parsed = JSON.parse(key);
    expect(parsed).toMatchObject({
      canonPath: '',
      seed: 4294967295, // uint32 coercion
      ajvMajor: 0,
      ajvClass: 'unknown',
      userKey: '',
    });
    expect(parsed.ajvFlags).toEqual({});
    expect(parsed.planOptionsSubKey).toContain('"trials.perBranch":2');
  });
});

describe('CompositionEngine traversal', () => {
  it('visits array items, prefixItems, and conditional branches', () => {
    const schema = {
      type: 'object',
      additionalProperties: { type: 'string' },
      properties: {
        list: {
          type: 'array',
          items: [
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                foo: { type: 'string' },
              },
            },
            {
              type: 'array',
              items: { type: 'integer' },
            },
          ],
          prefixItems: [{ type: 'number' }],
          contains: {
            type: 'object',
            additionalProperties: false,
            properties: {
              bar: { const: 1 },
            },
          },
        },
      },
      dependentSchemas: {
        list: { minItems: 1 },
      },
      definitions: {
        legacy: { type: 'null' },
      },
      $defs: {
        modern: { type: 'boolean' },
      },
      unevaluatedProperties: { type: 'number' },
      unevaluatedItems: { type: 'integer' },
      propertyNames: { pattern: '^foo' },
      not: { type: 'null' },
      if: { properties: { flag: { const: true } } },
      then: { required: ['flag'] },
      else: { properties: { alt: { type: 'number' } } },
    };

    const result = compose(makeInput(schema));
    expect(result.coverageIndex.has('')).toBe(true);
    expect(result.coverageIndex.has('/properties/list/items/0')).toBe(true);
    expect(result.coverageIndex.has('/properties/list/contains')).toBe(true);
    expect(result.containsBag.get('/properties/list')).toBeDefined();
  });
});

describe('CompositionEngine coverage index', () => {
  it('produces finite coverage entries with enumeration and provenance', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        a: { type: 'string' },
        b: { type: 'number' },
      },
    };

    const result = compose(makeInput(schema));
    const entry = result.coverageIndex.get('');
    expect(entry).toBeDefined();
    expect(entry?.has('a')).toBe(true);
    expect(entry?.has('b')).toBe(true);
    expect(entry?.has('c')).toBe(false);
    expect(entry?.enumerate?.()).toEqual(['a', 'b']);
    expect(entry?.provenance).toEqual(['properties']);
  });

  it('honors anchored-safe patternProperties as must-cover contributors', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      patternProperties: {
        '^(?:a|b)$': {},
      },
    };

    const result = compose(makeInput(schema));
    const entry = result.coverageIndex.get('');
    expect(entry).toBeDefined();
    expect(entry?.has('a')).toBe(true);
    expect(entry?.has('b')).toBe(true);
    expect(entry?.has('c')).toBe(false);
    expect(entry?.provenance).toEqual(['patternProperties']);
    expect(entry?.enumerate?.()).toEqual(['a', 'b']);
  });

  it('treats propertyNames synthetic patterns as coverage contributors', () => {
    const patternSource = '^(?:foo|bar)$';
    const schema = {
      type: 'object',
      additionalProperties: false,
      patternProperties: {
        [patternSource]: {},
      },
    };
    const ptrEntries: Array<[string, string]> = [
      [`/patternProperties/${patternSource}`, '#/propertyNames'],
    ];
    const result = compose(makeInput(schema, [], ptrEntries));

    const entry = result.coverageIndex.get('');
    expect(entry).toBeDefined();
    expect(entry?.provenance).toEqual(['propertyNamesSynthetic']);
    expect(entry?.enumerate?.()).toEqual(['bar', 'foo']);
    expect(entry?.has('foo')).toBe(true);
    expect(entry?.has('baz')).toBe(false);
  });

  it('does not enumerate for raw propertyNames.enum without §7 rewrite', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      propertyNames: { enum: ['a', 'b'] },
    } as const;

    const result = compose(makeInput(schema));
    const entry = result.coverageIndex.get('');
    expect(entry).toBeDefined();
    // enumerate() must be absent when finiteness derives only from raw propertyNames.enum
    expect(entry?.enumerate).toBeUndefined();
    // Gating-only: has() should not be satisfied solely by propertyNames.enum
    expect(entry?.has('a')).toBe(false);
    expect(entry?.has('b')).toBe(false);
    expect(entry?.has('c')).toBe(false);
  });

  it('handles vacuous coverage when additionalProperties is not false', () => {
    const schema = {
      type: 'object',
      properties: {
        x: { type: 'number' },
      },
    };

    const result = compose(makeInput(schema));
    const entry = result.coverageIndex.get('');
    expect(entry).toBeDefined();
    expect(entry?.has('anything')).toBe(true);
    expect(entry?.enumerate).toBeUndefined();
    expect(entry?.provenance).toEqual([]);
  });

  it('requires must-cover names to satisfy every additionalProperties:false conjunct', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['alpha'],
      properties: {
        alpha: { type: 'string' },
      },
      allOf: [
        {
          additionalProperties: false,
          properties: {
            beta: { type: 'string' },
          },
        },
      ],
    };

    const result = compose(makeInput(schema));
    const entry = result.coverageIndex.get('');
    expect(entry).toBeDefined();
    expect(entry?.has('alpha')).toBe(false);
    expect(entry?.has('beta')).toBe(false);
    expect(entry?.has('gamma')).toBe(false);
    expect(entry?.enumerate?.()).toEqual([]);
    const hint = result.diag?.unsatHints?.find(
      (record) => record.code === DIAGNOSTIC_CODES.UNSAT_AP_FALSE_EMPTY_COVERAGE
    );
    expect(hint).toBeDefined();
    const warnCodes = result.diag?.warn?.map((entry) => entry.code) ?? [];
    expect(warnCodes).toContain(DIAGNOSTIC_CODES.AP_FALSE_INTERSECTION_APPROX);
  });

  it('short-circuits UNSAT_AP_FALSE_EMPTY_COVERAGE in strict mode when must-cover set is provably empty under presence pressure', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
    };

    const result = compose(makeInput(schema));
    const fatal = result.diag?.fatal?.find(
      (entry) => entry.code === DIAGNOSTIC_CODES.UNSAT_AP_FALSE_EMPTY_COVERAGE
    );
    expect(fatal).toBeDefined();
    expect(fatal?.canonPath).toBe('');
    expect(fatal?.details).toEqual({ required: ['id'] });
    // No unsatHints when early-unsat is taken.
    const hasHints = (result.diag?.unsatHints ?? []).length > 0;
    expect(hasHints).toBe(false);
  });

  it('also short-circuits UNSAT_AP_FALSE_EMPTY_COVERAGE in lax mode (mode does not affect provable emptiness)', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
    };

    const result = compose(makeInput(schema), { mode: 'lax' });
    const fatal = result.diag?.fatal?.find(
      (entry) => entry.code === DIAGNOSTIC_CODES.UNSAT_AP_FALSE_EMPTY_COVERAGE
    );
    expect(fatal).toBeDefined();
    expect(fatal?.canonPath).toBe('');
    expect(fatal?.details).toEqual({ required: ['id'] });
    // No unsatHints when early-unsat is taken.
    const hasHints = (result.diag?.unsatHints ?? []).length > 0;
    expect(hasHints).toBe(false);
  });

  it('includes patternSource when a single unsafe pattern triggers the fail-fast', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['x'],
      patternProperties: {
        foo: {}, // missing anchors ⇒ unsafe pattern
      },
    };

    const result = compose(makeInput(schema));
    const fatal = result.diag?.fatal?.find(
      (entry) => entry.code === DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN
    );
    expect(fatal).toBeDefined();
    expect(fatal?.details).toEqual({
      sourceKind: 'patternProperties',
      patternSource: 'foo',
    });
  });

  it('uses propertyNamesSynthetic sourceKind when synthetic patterns trigger the fail-fast', () => {
    const patternSource = 'bar';
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['x'],
      patternProperties: {
        [patternSource]: {},
      },
    };

    const ptrEntries: Array<[string, string]> = [
      [`/patternProperties/${patternSource}`, '#/propertyNames'],
    ];
    const result = compose(makeInput(schema, [], ptrEntries));
    const fatal = result.diag?.fatal?.find(
      (entry) => entry.code === DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN
    );
    expect(fatal).toBeDefined();
    expect(fatal?.details).toEqual({
      sourceKind: 'propertyNamesSynthetic',
      patternSource,
    });
  });

  it('prefers patternProperties sourceKind when both synthetic and direct patterns are unsafe', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['x'],
      patternProperties: {
        foo: {},
        bar: {},
      },
    };
    const ptrEntries: Array<[string, string]> = [
      ['/patternProperties/bar', '#/propertyNames'],
    ];

    const result = compose(makeInput(schema, [], ptrEntries));
    const fatal = result.diag?.fatal?.find(
      (entry) => entry.code === DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN
    );
    expect(fatal).toBeDefined();
    expect(fatal?.details).toEqual({
      sourceKind: 'patternProperties',
    });
  });
});

describe('CompositionEngine contains bag', () => {
  it('collects contains needs with default minimum', () => {
    const containsSchema = { const: 1 };
    const schema = {
      type: 'array',
      contains: containsSchema,
    };

    const result = compose(makeInput(schema));
    const bag = result.containsBag.get('');
    expect(bag).toBeDefined();
    expect(bag).toHaveLength(1);
    expect(bag?.[0]?.schema).toBe(containsSchema);
    expect(bag?.[0]?.min).toBe(1);
    expect(bag?.[0]?.max).toBeUndefined();
  });

  it('concatenates contains needs across allOf branches', () => {
    const schema = {
      type: 'array',
      allOf: [
        { contains: { const: 'alpha' }, minContains: 2 },
        { contains: { const: 'beta' }, maxContains: 3 },
      ],
    };

    const result = compose(makeInput(schema));
    const bag = result.containsBag.get('');
    expect(bag).toEqual([
      { schema: { const: 'alpha' }, min: 2 },
      { schema: { const: 'beta' }, min: 1, max: 3 },
    ]);
  });

  it('emits fatal when contains antecedent is subset of blocker with max 0', () => {
    const sharedSchema = { const: ['alpha', { foo: 'bar' }] };
    const schema = {
      type: 'array',
      contains: sharedSchema,
      allOf: [
        {
          contains: sharedSchema,
          maxContains: 0,
        },
      ],
    };

    const result = compose(makeInput(schema));
    const fatal = result.diag?.fatal?.find(
      (entry) => entry.code === DIAGNOSTIC_CODES.CONTAINS_UNSAT_BY_SUM
    );
    expect(fatal).toBeDefined();
    expect(fatal?.details).toMatchObject({
      reason: 'subsetContradiction',
      antecedentIndex: 0,
      blockingIndex: 1,
    });
  });

  it('enforces complexity cap on contains needs', () => {
    const schema = {
      type: 'array',
      allOf: [
        { contains: { const: 1 } },
        { contains: { const: 2 } },
        { contains: { const: 3 } },
      ],
    };

    const result = compose(makeInput(schema), {
      planOptions: {
        complexity: {
          maxContainsNeeds: 2,
        },
      },
    });

    const bag = result.containsBag.get('');
    expect(bag).toHaveLength(2);
    expect(result.diag?.caps).toContain(
      DIAGNOSTIC_CODES.COMPLEXITY_CAP_CONTAINS
    );
    const warn = result.diag?.warn?.find(
      (entry) => entry.code === DIAGNOSTIC_CODES.COMPLEXITY_CAP_CONTAINS
    );
    expect(warn?.details).toEqual({ limit: 2, observed: 3 });
  });

  it('emits fatal diagnostic when min exceeds max', () => {
    const schema = {
      type: 'array',
      contains: { const: 'flag' },
      minContains: 3,
      maxContains: 2,
    };

    const result = compose(makeInput(schema));
    const fatal = result.diag?.fatal?.find(
      (entry) =>
        entry.code === DIAGNOSTIC_CODES.CONTAINS_NEED_MIN_GT_MAX &&
        entry.canonPath === ''
    );
    expect(fatal?.details).toEqual({ min: 3, max: 2 });
  });

  it('detects unsatisfiable sum when needs are disjoint', () => {
    const schema = {
      type: 'array',
      maxItems: 1,
      allOf: [
        { contains: { const: 'left' }, minContains: 1 },
        { contains: { const: 'right' }, minContains: 1 },
      ],
    };

    const result = compose(makeInput(schema));
    const fatal = result.diag?.fatal?.find(
      (entry) =>
        entry.code === DIAGNOSTIC_CODES.CONTAINS_UNSAT_BY_SUM &&
        entry.canonPath === ''
    );
    expect(fatal?.details).toMatchObject({
      disjointness: 'provable',
    });
  });

  it('records unsat hint when overlap is unknown', () => {
    const schema = {
      type: 'array',
      maxItems: 1,
      allOf: [
        { contains: { type: 'string' }, minContains: 1 },
        { contains: { type: 'string' }, minContains: 1 },
      ],
    };

    const result = compose(makeInput(schema));
    const hint = result.diag?.unsatHints?.find(
      (entry) =>
        entry.code === DIAGNOSTIC_CODES.CONTAINS_UNSAT_BY_SUM &&
        entry.canonPath === ''
    );
    expect(hint).toBeDefined();
    expect(hint?.provable).toBe(false);
    expect(hint?.reason).toBe('overlapUnknown');
    expect(hint?.details).toMatchObject({
      sumMin: 2,
      maxItems: 1,
    });
  });
});

describe('CompositionEngine branch selection', () => {
  it('records deterministic tie-breaking diagnostics for score-only paths', () => {
    const schema = {
      oneOf: [
        {
          type: 'object',
          properties: {
            kind: { const: 'A' },
          },
          required: ['kind'],
        },
        {
          type: 'object',
          properties: {
            kind: { const: 'B' },
          },
          required: ['kind'],
        },
      ],
    };

    const result = compose(makeInput(schema), {
      seed: 123,
      trials: {
        perBranch: 2,
        maxBranchesToTry: 8,
        skipTrials: true,
      },
    });

    const branches = result.diag?.branchDecisions ?? [];
    const branch = branches.find((entry) => entry.canonPath === '/oneOf');
    expect(branch).toBeDefined();
    expect(branch?.kind).toBe('oneOf');
    expect(branch?.scoreDetails.orderedIndices).toEqual([0, 1]);
    expect(branch?.scoreDetails.topScoreIndices).toEqual([0, 1]);
    expect(typeof branch?.scoreDetails.tiebreakRand).toBe('number');
    expect(branch?.budget).toEqual({
      tried: 0,
      limit: 4,
      skipped: true,
      reason: 'skipTrialsFlag',
    });
    const warn = result.diag?.warn?.find(
      (entry) =>
        entry.code === DIAGNOSTIC_CODES.TRIALS_SKIPPED_SCORE_ONLY &&
        entry.canonPath === '/oneOf'
    );
    expect(warn?.details).toEqual({ reason: 'skipTrialsFlag' });
  });

  it('captures branch score distribution when penalties apply', () => {
    const schema = {
      anyOf: [
        { type: 'string' },
        { type: 'number' },
        {
          type: 'object',
          patternProperties: {
            '.*': { type: 'boolean' },
          },
          additionalProperties: true,
        },
      ],
    };

    const result = compose(makeInput(schema));
    const branch = result.diag?.branchDecisions?.find(
      (entry) => entry.canonPath === '/anyOf'
    );
    const scores = branch?.scoreDetails.scoresByIndex;
    expect(scores).toBeDefined();
    expect(scores?.['2']).toBe(5);
    expect(branch?.scoreDetails.orderedIndices).toEqual([0, 1, 2]);
  });

  it('awards anchored disjoint patternProperties bonus', () => {
    const schema = {
      oneOf: [
        {
          type: 'object',
          patternProperties: {
            '^foo$': {},
          },
          additionalProperties: false,
        },
        {
          type: 'object',
          patternProperties: {
            '^bar$': {},
          },
          additionalProperties: false,
        },
      ],
    };

    const result = compose(makeInput(schema));
    const branch = result.diag?.branchDecisions?.find(
      (entry) => entry.canonPath === '/oneOf'
    );
    expect(branch).toBeDefined();
    const scores = branch?.scoreDetails.scoresByIndex;
    expect(scores?.['0']).toBe(50);
    expect(scores?.['1']).toBe(50);
  });
});

describe('CompositionEngine AP:false strict vs lax', () => {
  const unsafePatternSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['id'],
    patternProperties: {
      '.*': { type: 'string' },
    },
  } as const;

  it('emits fatal AP_FALSE_UNSAFE_PATTERN in strict mode when only unsafe coverage exists', () => {
    const result = compose(makeInput(unsafePatternSchema));
    const diag = result.diag;
    expect(diag).toBeDefined();
    const fatal = diag?.fatal ?? [];
    const fatalEntry = fatal.find(
      (entry) =>
        entry.code === DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN &&
        entry.canonPath === ''
    );
    expect(fatalEntry).toBeDefined();
    expect(fatalEntry?.details).toEqual({
      sourceKind: 'patternProperties',
      patternSource: '.*',
    });
    const warnCodes = diag?.warn?.map((entry) => entry.code) ?? [];
    expect(warnCodes).toContain(DIAGNOSTIC_CODES.AP_FALSE_INTERSECTION_APPROX);
    expect(
      warnCodes.filter(
        (code) => code === DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN
      )
    ).toHaveLength(0);
    const coverageEntry = result.coverageIndex.get('');
    expect(coverageEntry).toBeDefined();
    expect(coverageEntry?.enumerate?.()).toEqual([]);
    expect(coverageEntry?.has('any')).toBe(false);
  });

  it('downgrades unsafe pattern to warning in lax mode', () => {
    const result = compose(makeInput(unsafePatternSchema), { mode: 'lax' });
    const diag = result.diag;
    expect(diag).toBeDefined();
    const warn = diag?.warn ?? [];
    const warnEntry = warn.find(
      (entry) =>
        entry.code === DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN &&
        entry.canonPath === ''
    );
    expect(warnEntry).toBeDefined();
    expect(warnEntry?.details).toEqual({
      sourceKind: 'patternProperties',
      patternSource: '.*',
    });
    const fatal = diag?.fatal ?? [];
    expect(
      fatal.some(
        (entry) => entry.code === DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN
      )
    ).toBe(false);
    const approx = warn.find(
      (entry) =>
        entry.code === DIAGNOSTIC_CODES.AP_FALSE_INTERSECTION_APPROX &&
        entry.canonPath === ''
    );
    expect(approx).toBeDefined();
    const coverageEntry = result.coverageIndex.get('');
    expect(coverageEntry).toBeDefined();
    expect(coverageEntry?.enumerate?.()).toEqual([]);
  });

  it('does not emit AP_FALSE_UNSAFE_PATTERN for raw propertyNames.pattern gating without rewrite', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      // Raw propertyNames.pattern (no §7 rewrite): gating-only per SPEC §8
      propertyNames: { pattern: '^(?:id|name)$' },
    } as const;

    const result = compose(makeInput(schema));
    const diag = result.diag;
    expect(diag).toBeDefined();

    const hasApFalseFatal = (diag?.fatal ?? []).some(
      (e) =>
        e.code === DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN &&
        e.canonPath === ''
    );
    const hasApFalseWarn = (diag?.warn ?? []).some(
      (e) =>
        e.code === DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN &&
        e.canonPath === ''
    );
    expect(hasApFalseFatal).toBe(false);
    expect(hasApFalseWarn).toBe(false);

    const hint = diag?.unsatHints?.find(
      (e) =>
        e.code === DIAGNOSTIC_CODES.UNSAT_AP_FALSE_EMPTY_COVERAGE &&
        e.canonPath === ''
    );
    expect(hint).toBeDefined();

    const approx = (diag?.warn ?? []).find(
      (e) =>
        e.code === DIAGNOSTIC_CODES.AP_FALSE_INTERSECTION_APPROX &&
        e.canonPath === ''
    );
    expect(approx).toBeDefined();
    expect(approx?.details).toEqual({ reason: 'presencePressure' });
  });
});

describe('CompositionEngine complexity capping', () => {
  it('limits Top-K selection according to complexity caps', () => {
    const schema = {
      oneOf: [
        {
          type: 'object',
          properties: {
            kind: { const: 'A' },
          },
          required: ['kind'],
          additionalProperties: false,
        },
        {
          type: 'object',
          additionalProperties: true,
        },
        {
          type: ['string', 'number', 'boolean'],
        },
      ],
    };

    const result = compose(makeInput(schema), {
      planOptions: {
        complexity: {
          maxOneOfBranches: 1,
        },
      },
    });

    const branch = result.diag?.branchDecisions?.find(
      (entry) => entry.canonPath === '/oneOf'
    );
    expect(branch).toBeDefined();
    expect(branch?.scoreDetails.orderedIndices.length).toBe(3);
    expect(branch?.scoreDetails.topKIndices).toEqual([0]);
    expect(branch?.budget.limit).toBe(2);
    expect(branch?.budget.tried).toBe(0);
    expect(branch?.budget.skipped).toBe(true);
    expect(branch?.budget.reason).toBe('complexityCap');
    const warnCodes = result.diag?.warn?.map((entry) => entry.code) ?? [];
    expect(warnCodes).toContain(DIAGNOSTIC_CODES.COMPLEXITY_CAP_ONEOF);
    expect(warnCodes).toContain(DIAGNOSTIC_CODES.TRIALS_SKIPPED_COMPLEXITY_CAP);
    expect(result.diag?.caps).toContain(DIAGNOSTIC_CODES.COMPLEXITY_CAP_ONEOF);
    expect(branch?.memoKey).toBeDefined();
  });

  it('prioritizes skipTrialsFlag reason when complexity cap also applies', () => {
    const schema = {
      anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
    };

    const result = compose(makeInput(schema), {
      planOptions: {
        trials: {
          skipTrials: true,
        },
        complexity: {
          maxAnyOfBranches: 2,
        },
      },
    });

    const branch = result.diag?.branchDecisions?.find(
      (entry) => entry.canonPath === '/anyOf'
    );
    expect(branch).toBeDefined();
    expect(branch?.budget.skipped).toBe(true);
    expect(branch?.budget.reason).toBe('skipTrialsFlag');
    const warnCodes = result.diag?.warn?.map((entry) => entry.code) ?? [];
    expect(warnCodes).toContain(DIAGNOSTIC_CODES.TRIALS_SKIPPED_SCORE_ONLY);
    expect(warnCodes).toContain(DIAGNOSTIC_CODES.COMPLEXITY_CAP_ANYOF);
    expect(result.diag?.caps).toContain(DIAGNOSTIC_CODES.COMPLEXITY_CAP_ANYOF);
  });

  it('keeps exclusivity diagnostics deferred for tied oneOf overlap', () => {
    const schema = {
      oneOf: [
        {
          type: 'object',
          properties: {
            tag: { const: 'alpha' },
          },
          required: ['tag'],
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: {
            tag: { const: 'beta' },
          },
          required: ['tag'],
          additionalProperties: false,
        },
      ],
    };

    const result = compose(makeInput(schema), {
      seed: 7,
      planOptions: {
        trials: {
          skipTrials: true,
        },
      },
    });

    const branch = result.diag?.branchDecisions?.find(
      (entry) => entry.canonPath === '/oneOf'
    );
    expect(branch).toBeDefined();
    expect(branch?.scoreDetails.topScoreIndices).toEqual([0, 1]);
    expect(typeof branch?.scoreDetails.tiebreakRand).toBe('number');
    expect(branch?.scoreDetails.exclusivityRand).toBeUndefined();
    expect(result.diag?.overlap).toBeUndefined();
  });
});

describe('CompositionEngine coverage diagnostics', () => {
  it('emits coverage regex diagnostics at owning canonPath', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      patternProperties: {
        '(': { type: 'string' },
      },
    };

    const result = compose(makeInput(schema));
    const regexWarns =
      result.diag?.warn?.filter(
        (entry) => entry.code === DIAGNOSTIC_CODES.REGEX_COMPILE_ERROR
      ) ?? [];
    expect(regexWarns).toHaveLength(1);
    expect(regexWarns[0]?.canonPath).toBe('');
  });
});

// Enumeration cap is exercised indirectly by other tests; no dedicated cap test here.

describe('CompositionEngine early-unsat with propertyNames', () => {
  it('emits UNSAT_MINPROPS_PNAMES when propertyNames enum is empty and minProperties>0', () => {
    const schema = {
      type: 'object',
      minProperties: 1,
      propertyNames: { enum: [] },
    } as const;

    const result = compose(makeInput(schema));
    const fatal = result.diag?.fatal ?? [];
    const found = fatal.find(
      (e) =>
        e.code === DIAGNOSTIC_CODES.UNSAT_MINPROPS_PNAMES && e.canonPath === ''
    );
    expect(found).toBeDefined();
    expect(found?.details).toEqual({ minProperties: 1 });
  });

  it('emits UNSAT_REQUIRED_PNAMES when required contains names not in propertyNames enum', () => {
    const schema = {
      type: 'object',
      required: ['a', 'b'],
      propertyNames: { enum: ['a'] },
    } as const;

    const result = compose(makeInput(schema));
    const fatal = result.diag?.fatal ?? [];
    const found = fatal.find(
      (e) =>
        e.code === DIAGNOSTIC_CODES.UNSAT_REQUIRED_PNAMES && e.canonPath === ''
    );
    expect(found).toBeDefined();
    expect(found?.details).toEqual({ requiredOut: ['b'] });
  });
});

describe('CompositionEngine schema byte-size cap', () => {
  it('emits COMPLEXITY_CAP_SCHEMA_SIZE when canonical JSON exceeds limit', () => {
    const schema = {
      type: 'object',
      properties: Object.fromEntries(
        Array.from({ length: 200 }, (_, i) => [`p${i}`, { type: 'string' }])
      ),
    } as const;

    const result = compose(makeInput(schema), {
      planOptions: { complexity: { maxSchemaBytes: 200 } },
    });
    const codes = result.diag?.warn?.map((w) => w.code) ?? [];
    expect(codes).toContain(DIAGNOSTIC_CODES.COMPLEXITY_CAP_SCHEMA_SIZE);
    expect(result.diag?.caps).toContain(
      DIAGNOSTIC_CODES.COMPLEXITY_CAP_SCHEMA_SIZE
    );
  });
});

describe('computeSelectorMemoKey', () => {
  it('includes plan options subkey, AJV metadata, and user salt', () => {
    const key = computeSelectorMemoKey({
      canonPath: '/oneOf',
      seed: 42,
      planOptions: {
        trials: {
          perBranch: 3,
        },
      },
      userKey: 'user-salt',
      ajvMetadata: {
        ajvMajor: 8,
        ajvClass: 'PlanningAjv',
        ajvFlags: { unicodeRegExp: true, validateFormats: false },
      },
    });

    const parsed = JSON.parse(key);
    expect(parsed.canonPath).toBe('/oneOf');
    expect(parsed.seed).toBe(42);
    expect(parsed.ajvMajor).toBe(8);
    expect(parsed.ajvClass).toBe('PlanningAjv');
    expect(parsed.userKey).toBe('user-salt');
    const subKey = JSON.parse(parsed.planOptionsSubKey);
    expect(subKey['trials.perBranch']).toBe(3);
    expect(subKey['trials.skipTrials']).toBe(false);
    expect(parsed.ajvFlags).toEqual({
      unicodeRegExp: true,
      validateFormats: false,
    });
  });
});
