/* eslint-disable complexity */
import { describe, it, expect } from 'vitest';

import { DIAGNOSTIC_CODES } from '../../diag/codes';
import { compose, computeSelectorMemoKey } from '../composition-engine';

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

    const result = compose(schema);
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

    const result = compose(schema);
    const entry = result.coverageIndex.get('');
    expect(entry).toBeDefined();
    expect(entry?.has('a')).toBe(true);
    expect(entry?.has('b')).toBe(true);
    expect(entry?.has('c')).toBe(false);
    expect(entry?.provenance).toEqual(['patternProperties']);
    expect(entry?.enumerate?.()).toEqual(['a', 'b']);
  });

  it('handles vacuous coverage when additionalProperties is not false', () => {
    const schema = {
      type: 'object',
      properties: {
        x: { type: 'number' },
      },
    };

    const result = compose(schema);
    const entry = result.coverageIndex.get('');
    expect(entry).toBeDefined();
    expect(entry?.has('anything')).toBe(true);
    expect(entry?.enumerate).toBeUndefined();
    expect(entry?.provenance).toEqual([]);
  });

  it('emits unsat hint when must-cover set is empty under presence pressure', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
    };

    const result = compose(schema);
    const hint = result.diag?.unsatHints?.[0];
    expect(hint).toBeDefined();
    expect(hint?.code).toBe(DIAGNOSTIC_CODES.UNSAT_AP_FALSE_EMPTY_COVERAGE);
    expect(hint?.canonPath).toBe('');
    expect(hint?.details).toEqual({ required: ['id'] });
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

    const result = compose(schema, {
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

    const result = compose(schema);
    const branch = result.diag?.branchDecisions?.find(
      (entry) => entry.canonPath === '/anyOf'
    );
    const scores = branch?.scoreDetails.scoresByIndex;
    expect(scores).toBeDefined();
    expect(scores?.['2']).toBe(5);
    expect(branch?.scoreDetails.orderedIndices).toEqual([0, 1, 2]);
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
    const result = compose(unsafePatternSchema);
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
    const result = compose(unsafePatternSchema, { mode: 'lax' });
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

    const result = compose(schema, {
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

    const result = compose(schema, {
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

    const result = compose(schema, {
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
