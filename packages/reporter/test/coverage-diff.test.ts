import { describe, it, expect } from 'vitest';

import type { CoverageReport, CoverageTargetReport } from '@foundrydata/shared';

import { diffCoverageTargets } from '../src/coverage/coverage-diff.js';

function makeReport(targets: CoverageTargetReport[]): CoverageReport {
  return {
    version: 'coverage-report/v1',
    reportMode: 'full',
    engine: {
      foundryVersion: '1.0.0',
      coverageMode: 'measure',
      ajvMajor: 8,
    },
    run: {
      seed: 1,
      masterSeed: 1,
      maxInstances: 1,
      actualInstances: 1,
      dimensionsEnabled: ['structure'],
      excludeUnreachable: false,
      startedAt: '2025-01-01T00:00:00Z',
      durationMs: 1,
    },
    metrics: {
      coverageStatus: 'ok',
      overall: 1,
      byDimension: { structure: 1 },
      byOperation: {},
      targetsByStatus: { active: 1 },
    },
    targets,
    uncoveredTargets: [],
    unsatisfiedHints: [],
    diagnostics: { plannerCapsHit: [], notes: [] },
  };
}

const baseTarget: Omit<CoverageTargetReport, 'id'> = {
  dimension: 'structure',
  kind: 'SCHEMA_NODE',
  canonPath: '#/properties/a',
  status: 'active',
  hit: true,
};

function withId(
  id: string,
  overrides: Partial<CoverageTargetReport> = {}
): CoverageTargetReport {
  return {
    id,
    ...baseTarget,
    ...overrides,
  };
}

describe('diffCoverageTargets', () => {
  it('classifies unchanged targets when id and identifying shape match', () => {
    const a = makeReport([withId('t1')]);
    const b = makeReport([withId('t1')]);

    const diff = diffCoverageTargets(a, b);

    expect(diff.targets).toHaveLength(1);
    expect(diff.targets[0].kind).toBe('unchanged');
    expect(diff.targets[0].from?.id).toBe('t1');
    expect(diff.targets[0].to?.id).toBe('t1');
    expect(diff.newlyUncovered).toHaveLength(0);
  });

  it('classifies removed and added targets when ids differ', () => {
    const a = makeReport([withId('t1')]);
    const b = makeReport([withId('t2')]);

    const diff = diffCoverageTargets(a, b);

    expect(diff.targets.map((e) => e.kind).sort()).toEqual([
      'added',
      'removed',
    ]);
    const removed = diff.targets.find((e) => e.kind === 'removed');
    const added = diff.targets.find((e) => e.kind === 'added');

    expect(removed?.from?.id).toBe('t1');
    expect(added?.to?.id).toBe('t2');
    expect(diff.newlyUncovered).toHaveLength(0);
  });

  it('classifies statusChanged when status or hit differ', () => {
    const a = makeReport([withId('t1', { hit: true })]);
    const b = makeReport([withId('t1', { hit: false })]);

    const diff = diffCoverageTargets(a, b);

    expect(diff.targets).toHaveLength(1);
    expect(diff.targets[0].kind).toBe('statusChanged');
    expect(diff.targets[0].from?.hit).toBe(true);
    expect(diff.targets[0].to?.hit).toBe(false);
    expect(diff.newlyUncovered).toHaveLength(1);
    expect(diff.newlyUncovered[0]).toBe(diff.targets[0]);
  });

  it('treats same id but different shape as removed + added', () => {
    const a = makeReport([
      withId('t1', { canonPath: '#/properties/a', hit: true }),
    ]);
    const b = makeReport([
      withId('t1', { canonPath: '#/properties/b', hit: false }),
    ]);

    const diff = diffCoverageTargets(a, b);

    expect(diff.targets.map((e) => e.kind).sort()).toEqual([
      'added',
      'removed',
    ]);
    const added = diff.targets.find((e) => e.kind === 'added');

    expect(added?.to?.canonPath).toBe('#/properties/b');
    expect(diff.newlyUncovered).toHaveLength(1);
    expect(diff.newlyUncovered[0].kind).toBe('added');
    expect(diff.newlyUncovered[0].to?.hit).toBe(false);
  });

  it('accumulates added targets from B only and tracks newly uncovered', () => {
    const a = makeReport([withId('t1', { hit: true })]);
    const b = makeReport([
      withId('t1', { hit: true }),
      withId('t2', { hit: false }),
      withId('t3', { hit: true }),
    ]);

    const diff = diffCoverageTargets(a, b);

    expect(diff.targets.some((e) => e.kind === 'unchanged')).toBe(true);
    const added = diff.targets.filter((e) => e.kind === 'added');
    expect(added).toHaveLength(2);

    const newlyIds = diff.newlyUncovered.map((e) => e.to?.id);
    expect(newlyIds).toContain('t2');
    expect(newlyIds).not.toContain('t3');
  });
});
