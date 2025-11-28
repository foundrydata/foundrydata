import { describe, it, expect } from 'vitest';
import type { CoverageDimension } from '@foundrydata/shared';
import {
  DEFAULT_PLANNER_DIMENSION_ORDER,
  DEFAULT_PLANNER_DIMENSIONS_ENABLED,
  assignTestUnitSeeds,
  isCoverageHint,
  planTestUnits,
  resolveCoveragePlannerConfig,
  type CoverageHint,
  type CoveragePlannerConfig,
  type CoveragePlannerInput,
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

describe('planTestUnits', () => {
  const makeConfig = (maxInstances: number): CoveragePlannerConfig => {
    const config = resolveCoveragePlannerConfig({ maxInstances });
    return config;
  };

  const makeInput = (
    targets: Parameters<typeof planTestUnits>[0]['targets'],
    config: CoveragePlannerConfig
  ): CoveragePlannerInput => ({
    graph: { nodes: [], edges: [] },
    targets,
    config,
  });

  it('returns empty array when no active targets', () => {
    const config = makeConfig(5);
    const input = makeInput(
      [
        {
          id: 't1',
          dimension: 'structure',
          kind: 'SCHEMA_NODE',
          canonPath: '#',
          status: 'unreachable',
        },
      ],
      config
    );

    const units = planTestUnits(input);

    expect(units).toEqual([]);
  });

  it('plans at most maxInstances units and respects ordering', () => {
    const targets = [
      {
        id: 't1',
        dimension: 'structure',
        kind: 'SCHEMA_NODE',
        canonPath: '#/a',
      },
      {
        id: 't2',
        dimension: 'branches',
        kind: 'ONEOF_BRANCH',
        canonPath: '#/oneOf/0',
      },
      {
        id: 't3',
        dimension: 'enum',
        kind: 'ENUM_VALUE_HIT',
        canonPath: '#',
      },
    ] as const;

    const config = resolveCoveragePlannerConfig({
      maxInstances: 2,
      dimensionsEnabled: ['structure', 'branches', 'enum'],
      dimensionPriority: ['branches', 'enum', 'structure'],
    });

    const units = planTestUnits(makeInput([...targets], config));

    const firstUnit = units[0];
    const secondUnit = units[1];
    if (!firstUnit || !secondUnit) {
      throw new Error('expected at least two planned units');
    }
    if (!firstUnit.scope || !secondUnit.scope) {
      throw new Error('expected scopes on planned units');
    }
    const firstPaths = firstUnit.scope.schemaPaths!;
    const secondPaths = secondUnit.scope.schemaPaths!;
    expect(firstPaths).toEqual(['#/oneOf/0']);
    expect(secondPaths).toEqual(['#']);
    for (const unit of units) {
      expect(unit.count).toBe(1);
      expect(unit.hints).toEqual([]);
      expect(typeof unit.seed).toBe('number');
    }
  });

  it('groups units deterministically by operationKey when present', () => {
    const targets: CoveragePlannerInput['targets'] = [
      {
        id: 'op1-branches',
        dimension: 'branches',
        kind: 'ONEOF_BRANCH',
        canonPath: '#/oneOf/0',
        operationKey: 'GET /users',
      },
      {
        id: 'global-branches',
        dimension: 'branches',
        kind: 'ONEOF_BRANCH',
        canonPath: '#/oneOf/1',
      },
    ];

    const config = makeConfig(2);
    const units = planTestUnits(makeInput(targets, config));

    const firstUnit = units[0];
    const secondUnit = units[1];
    if (!firstUnit || !secondUnit) {
      throw new Error('expected at least two planned units');
    }
    if (!firstUnit.scope) {
      throw new Error('expected scope on first planned unit');
    }
    const operationKey = firstUnit.scope.operationKey!;
    expect(operationKey).toBe('GET /users');
  });

  it('assigns deterministic seeds from masterSeed and unit id', () => {
    const targets: CoveragePlannerInput['targets'] = [
      {
        id: 't1',
        dimension: 'branches',
        kind: 'ONEOF_BRANCH',
        canonPath: '#/oneOf/0',
      },
      {
        id: 't2',
        dimension: 'branches',
        kind: 'ONEOF_BRANCH',
        canonPath: '#/oneOf/1',
      },
    ];

    const config = resolveCoveragePlannerConfig({
      maxInstances: 2,
      dimensionsEnabled: ['branches'],
      dimensionPriority: ['branches'],
    });

    const baseUnits = planTestUnits(makeInput(targets, config));
    const unitsRun1 = assignTestUnitSeeds(baseUnits, { masterSeed: 42 });
    const unitsRun2 = assignTestUnitSeeds(baseUnits, { masterSeed: 42 });

    expect(unitsRun1.map((u) => u.seed)).toEqual(unitsRun2.map((u) => u.seed));

    const unitsOtherSeed = assignTestUnitSeeds(baseUnits, { masterSeed: 43 });
    expect(unitsOtherSeed.map((u) => u.seed)).not.toEqual(
      unitsRun1.map((u) => u.seed)
    );
  });
});
