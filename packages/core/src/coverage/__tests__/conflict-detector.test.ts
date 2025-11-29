import { describe, it, expect } from 'vitest';

import { ConflictDetector } from '../conflict-detector.js';

import type { CoverageTarget } from '@foundrydata/shared';
import type { CoverageIndex } from '../../transform/composition-engine.js';

describe('ConflictDetector', () => {
  it('flags ensurePropertyPresence hints when target is unreachable', () => {
    const target: CoverageTarget = {
      id: 't1',
      dimension: 'structure',
      kind: 'PROPERTY_PRESENT',
      canonPath: '#/properties/foo',
      params: { propertyName: 'foo' },
      status: 'unreachable',
    } as CoverageTarget;

    const result = ConflictDetector.checkHintConflict({
      hint: {
        kind: 'ensurePropertyPresence',
        canonPath: '#/properties/foo',
        params: { propertyName: 'foo' },
      },
      target,
      canonSchema: {},
      coverageIndex: new Map() as CoverageIndex,
    });

    expect(result.isConflicting).toBe(true);
    expect(result.reasonCode).toBe('CONFLICTING_CONSTRAINTS');
  });

  it('flags ensurePropertyPresence hints when owning schema is boolean false', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        blocked: false,
      },
    };

    const result = ConflictDetector.checkHintConflict({
      hint: {
        kind: 'ensurePropertyPresence',
        canonPath: '#',
        params: { propertyName: 'blocked', present: true },
      },
      canonSchema: schema,
      coverageIndex: new Map() as CoverageIndex,
    });

    expect(result.isConflicting).toBe(true);
    expect(result.reasonCode).toBe('CONFLICTING_CONSTRAINTS');
  });

  it('flags property hints when CoverageIndex denies the property', () => {
    const coverageIndex: CoverageIndex = new Map();
    coverageIndex.set('', {
      has: (name: string) => name !== 'blocked',
    } as const);

    const result = ConflictDetector.checkHintConflict({
      hint: {
        kind: 'ensurePropertyPresence',
        canonPath: '#',
        params: { propertyName: 'blocked' },
      },
      canonSchema: {},
      coverageIndex,
    });

    expect(result.isConflicting).toBe(true);
    expect(result.reasonDetail).toContain('CoverageIndex forbids property');
  });

  it('flags property hints when not/required forbids the property', () => {
    const schema = {
      type: 'object',
      not: {
        required: ['blocked'],
      },
      properties: {
        blocked: { type: 'string' },
      },
    };

    const result = ConflictDetector.checkHintConflict({
      hint: {
        kind: 'ensurePropertyPresence',
        canonPath: '#',
        params: { propertyName: 'blocked', present: true },
      },
      canonSchema: schema,
      coverageIndex: new Map() as CoverageIndex,
    });

    expect(result.isConflicting).toBe(true);
    expect(result.reasonCode).toBe('CONFLICTING_CONSTRAINTS');
    expect(result.reasonDetail).toContain('not/required');
  });

  it('flags preferBranch hints that exceed branch count', () => {
    const schema = {
      oneOf: [{}, {}],
    };

    const target: CoverageTarget = {
      id: 'branch-0',
      dimension: 'branches',
      kind: 'ONEOF_BRANCH',
      canonPath: '#/oneOf/2',
    } as CoverageTarget;

    const result = ConflictDetector.checkHintConflict({
      hint: {
        kind: 'preferBranch',
        canonPath: '#/oneOf',
        params: { branchIndex: 2 },
      },
      target,
      canonSchema: schema,
      coverageIndex: new Map() as CoverageIndex,
    });

    expect(result.isConflicting).toBe(true);
    expect(result.reasonDetail).toContain('exceeds available branches');
  });

  it('flags coverEnumValue hints with out-of-range index', () => {
    const result = ConflictDetector.checkHintConflict({
      hint: {
        kind: 'coverEnumValue',
        canonPath: '#',
        params: { valueIndex: 5 },
      },
      canonSchema: { enum: ['A', 'B'] },
      coverageIndex: new Map() as CoverageIndex,
    });

    expect(result.isConflicting).toBe(true);
    expect(result.reasonDetail).toContain('out of range');
  });
});
