import { describe, it, expect } from 'vitest';
import type { CoverageDimension } from '@foundrydata/shared';
import {
  DEFAULT_PLANNER_DIMENSION_ORDER,
  DEFAULT_PLANNER_DIMENSIONS_ENABLED,
  isCoverageHint,
  resolveCoveragePlannerConfig,
  type CoverageHint,
  type ResolvePlannerConfigOptions,
} from '../index.js';

describe('resolveCoveragePlannerConfig', () => {
  it('uses defaults when only maxInstances is provided', () => {
    const options: ResolvePlannerConfigOptions = {
      maxInstances: 10,
    };

    const config = resolveCoveragePlannerConfig(options);

    expect(config.budget.maxInstances).toBe(10);
    expect(config.budget.softTimeMs).toBeUndefined();
    expect(config.dimensionsEnabled).toEqual(
      Array.from(DEFAULT_PLANNER_DIMENSIONS_ENABLED)
    );
    expect(config.dimensionPriority).toEqual(
      Array.from(DEFAULT_PLANNER_DIMENSION_ORDER).filter((dim) =>
        DEFAULT_PLANNER_DIMENSIONS_ENABLED.includes(dim)
      )
    );
  });

  it('normalizes dimensions and priority order', () => {
    const dims: CoverageDimension[] = ['enum', 'structure'];
    const options: ResolvePlannerConfigOptions = {
      maxInstances: 5,
      dimensionsEnabled: dims,
      dimensionPriority: ['structure', 'enum'],
    };

    const config = resolveCoveragePlannerConfig(options);

    expect(config.dimensionsEnabled).toEqual(dims);
    // priority keeps explicit order and does not introduce new dimensions
    expect(config.dimensionPriority).toEqual(['structure', 'enum']);
  });

  it('throws on invalid maxInstances and softTimeMs', () => {
    expect(() => resolveCoveragePlannerConfig({ maxInstances: 0 })).toThrow(
      /maxInstances/
    );

    expect(() =>
      resolveCoveragePlannerConfig({
        maxInstances: 1,
        softTimeMs: 0,
      })
    ).toThrow(/softTimeMs/);
  });
});

describe('isCoverageHint', () => {
  it('accepts well-formed hints', () => {
    const hints: CoverageHint[] = [
      {
        kind: 'preferBranch',
        canonPath: '#/oneOf',
        params: { branchIndex: 1 },
      },
      {
        kind: 'ensurePropertyPresence',
        canonPath: '#/properties/name',
        params: { propertyName: 'name', present: true },
      },
      {
        kind: 'coverEnumValue',
        canonPath: '#',
        params: { valueIndex: 0 },
      },
    ];

    for (const hint of hints) {
      expect(isCoverageHint(hint)).toBe(true);
    }
  });

  it('rejects malformed hints', () => {
    expect(isCoverageHint(null)).toBe(false);
    expect(isCoverageHint({})).toBe(false);
    expect(
      isCoverageHint({
        kind: 'preferBranch',
        canonPath: '',
        params: { branchIndex: 1 },
      })
    ).toBe(false);
    expect(
      isCoverageHint({
        kind: 'preferBranch',
        canonPath: '#/oneOf',
        params: { branchIndex: 'x' },
      })
    ).toBe(false);
    expect(
      isCoverageHint({
        kind: 'ensurePropertyPresence',
        canonPath: '#/properties/name',
        params: { propertyName: 123, present: true },
      })
    ).toBe(false);
    expect(
      isCoverageHint({
        kind: 'coverEnumValue',
        canonPath: '#',
        params: { valueIndex: '0' },
      })
    ).toBe(false);
  });
});
