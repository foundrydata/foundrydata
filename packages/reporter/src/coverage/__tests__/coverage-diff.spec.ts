import { describe, it, expect } from 'vitest';

import type {
  CoverageDimension,
  CoverageTargetReport,
  CoverageReport,
} from '@foundrydata/shared';
import { COVERAGE_REPORT_VERSION_V1 } from '@foundrydata/shared';

import {
  diffCoverageReports,
  diffCoverageTargets,
  type CoverageMetricDelta,
} from '../coverage-diff.js';

function makeTarget(
  overrides: Partial<CoverageTargetReport> = {}
): CoverageTargetReport {
  const dimension =
    (overrides.dimension as CoverageDimension | undefined) ?? 'structure';
  const kind = overrides.kind ?? 'SCHEMA_NODE';
  const status =
    overrides.status ??
    (kind === 'SCHEMA_REUSED_COVERED' ? 'deprecated' : undefined);

  const base = {
    id: overrides.id ?? 't',
    dimension,
    kind,
    canonPath: overrides.canonPath ?? '#',
    operationKey: overrides.operationKey,
    params: overrides.params,
    status,
    weight: overrides.weight,
    polarity: overrides.polarity,
    meta: overrides.meta,
    hit: overrides.hit ?? false,
  } as CoverageTargetReport;

  return base;
}

// eslint-disable-next-line complexity
function makeReport(overrides: Partial<CoverageReport> = {}): CoverageReport {
  const targets = overrides.targets ?? [];

  return {
    version: overrides.version ?? COVERAGE_REPORT_VERSION_V1,
    reportMode: overrides.reportMode ?? 'full',
    engine: {
      foundryVersion: '1.0.0',
      coverageMode: 'measure',
      ajvMajor: 8,
      ...(overrides.engine ?? {}),
    },
    run: {
      seed: 1,
      masterSeed: 1,
      maxInstances: 10,
      actualInstances: 10,
      dimensionsEnabled: ['structure', 'branches', 'enum'],
      excludeUnreachable: false,
      startedAt: '2025-01-01T00:00:00Z',
      durationMs: 1,
      ...(overrides.run ?? {}),
    },
    metrics: {
      coverageStatus: 'ok',
      overall: 0,
      byDimension: {},
      byOperation: {},
      targetsByStatus: {},
      ...(overrides.metrics ?? {}),
    },
    targets,
    uncoveredTargets: overrides.uncoveredTargets ?? [],
    unsatisfiedHints: overrides.unsatisfiedHints ?? [],
    diagnostics:
      overrides.diagnostics ?? ({ plannerCapsHit: [], notes: [] } as any),
  };
}

function expectDelta(
  delta: CoverageMetricDelta,
  from: number,
  to: number
): void {
  expect(delta.from).toBeCloseTo(from, 6);
  expect(delta.to).toBeCloseTo(to, 6);
  expect(delta.delta).toBeCloseTo(to - from, 6);
}

describe('diffCoverageTargets', () => {
  it('classifies unchanged, added, removed and statusChanged targets', () => {
    const aTargets: CoverageTargetReport[] = [
      makeTarget({ id: 's1', hit: true }),
      makeTarget({ id: 's2', hit: false }),
    ];

    const bTargets: CoverageTargetReport[] = [
      // unchanged
      makeTarget({ id: 's1', hit: true }),
      // statusChanged (hit:false → hit:true)
      makeTarget({ id: 's2', hit: true }),
      // added
      makeTarget({ id: 's3', hit: false }),
    ];

    const reportA = makeReport({ targets: aTargets });
    const reportB = makeReport({ targets: bTargets });

    const diff = diffCoverageTargets(reportA, reportB);

    const kinds = diff.targets.map((entry) => entry.kind).sort();
    expect(kinds).toEqual(['added', 'statusChanged', 'unchanged']);

    const newlyUncoveredIds = diff.newlyUncovered
      .map((entry) => entry.to?.id ?? entry.from?.id)
      .filter((id): id is string => !!id)
      .sort();

    // Only targets that are newly uncovered (hit:true → hit:false, or
    // added with hit:false) should appear; here only s3 qualifies.
    expect(newlyUncoveredIds).toEqual(['s3']);
  });
});

describe('diffCoverageReports', () => {
  it('computes positive deltas when coverage improves on common targets', () => {
    const baseTargets: CoverageTargetReport[] = [
      makeTarget({
        id: 't1',
        dimension: 'structure',
        operationKey: 'getUser',
        hit: true,
      }),
      makeTarget({
        id: 't2',
        dimension: 'branches',
        kind: 'ONEOF_BRANCH',
        operationKey: 'getUser',
        hit: false,
      }),
      makeTarget({
        id: 't3',
        dimension: 'structure',
        operationKey: 'createUser',
        hit: false,
      }),
    ];

    const improvedTargets: CoverageTargetReport[] = [
      makeTarget({
        id: 't1',
        dimension: 'structure',
        operationKey: 'getUser',
        hit: true,
      }),
      makeTarget({
        id: 't2',
        dimension: 'branches',
        kind: 'ONEOF_BRANCH',
        operationKey: 'getUser',
        hit: true,
      }),
      makeTarget({
        id: 't3',
        dimension: 'structure',
        operationKey: 'createUser',
        hit: false,
      }),
    ];

    const reportA = makeReport({
      targets: baseTargets,
      run: {
        dimensionsEnabled: ['structure', 'branches'],
        excludeUnreachable: false,
      } as CoverageReport['run'],
    });

    const reportB = makeReport({
      targets: improvedTargets,
      run: {
        dimensionsEnabled: ['structure', 'branches'],
        excludeUnreachable: false,
      } as CoverageReport['run'],
    });

    const { summary } = diffCoverageReports(reportA, reportB);

    expect(summary.overall.delta).toBeGreaterThan(0);
    const getUserDelta = summary.byOperation.common.find(
      (d) => d.operationKey === 'getUser'
    );
    expect(getUserDelta).toBeDefined();
    expect(getUserDelta && getUserDelta.delta).toBeGreaterThan(0);

    expect(summary.byOperation.regressions).toHaveLength(0);
    expect(
      summary.byOperation.improvements.some((d) => d.operationKey === 'getUser')
    ).toBe(true);

    expect(summary.newlyUncovered).toHaveLength(0);
  });

  it('treats targets from newly enabled dimensions as added gaps but does not fold them into metric deltas', () => {
    const baseTargets: CoverageTargetReport[] = [
      makeTarget({
        id: 's1',
        dimension: 'structure',
        operationKey: 'getUser',
        hit: true,
      }),
    ];

    const comparisonTargets: CoverageTargetReport[] = [
      makeTarget({
        id: 's1',
        dimension: 'structure',
        operationKey: 'getUser',
        hit: true,
      }),
      makeTarget({
        id: 'b1',
        dimension: 'branches',
        kind: 'ONEOF_BRANCH',
        operationKey: 'getUser',
        hit: false,
      }),
    ];

    const reportA = makeReport({
      targets: baseTargets,
      run: {
        dimensionsEnabled: ['structure'],
        excludeUnreachable: false,
      } as CoverageReport['run'],
    });

    const reportB = makeReport({
      targets: comparisonTargets,
      run: {
        dimensionsEnabled: ['structure', 'branches'],
        excludeUnreachable: false,
      } as CoverageReport['run'],
    });

    const { summary } = diffCoverageReports(reportA, reportB);

    // Over the common universe (structure targets present in both),
    // coverage remains identical.
    expectDelta(summary.overall, 1, 1);

    const ops = summary.byOperation.common;
    expect(ops.length).toBe(1);
    expect(ops[0]?.operationKey).toBe('getUser');
    expectDelta(ops[0]!, 1, 1);

    // The newly added branches target is surfaced as a new gap.
    const newlyUncoveredIds = summary.newlyUncovered
      .map((entry) => entry.to?.id ?? entry.from?.id)
      .filter((id): id is string => !!id);

    expect(newlyUncoveredIds).toContain('b1');
  });

  it('highlights regressions over the common universe and includes newly uncovered targets', () => {
    const baseTargets: CoverageTargetReport[] = [
      makeTarget({
        id: 't1',
        dimension: 'structure',
        operationKey: 'getUser',
        hit: true,
      }),
      makeTarget({
        id: 't2',
        dimension: 'structure',
        operationKey: 'getUser',
        hit: true,
      }),
    ];

    const regressedTargets: CoverageTargetReport[] = [
      makeTarget({
        id: 't1',
        dimension: 'structure',
        operationKey: 'getUser',
        hit: true,
      }),
      makeTarget({
        id: 't2',
        dimension: 'structure',
        operationKey: 'getUser',
        hit: false,
      }),
      // Added uncovered target in the same operation.
      makeTarget({
        id: 't3',
        dimension: 'structure',
        operationKey: 'getUser',
        hit: false,
      }),
    ];

    const reportA = makeReport({
      targets: baseTargets,
      run: {
        dimensionsEnabled: ['structure'],
        excludeUnreachable: false,
      } as CoverageReport['run'],
    });

    const reportB = makeReport({
      targets: regressedTargets,
      run: {
        dimensionsEnabled: ['structure'],
        excludeUnreachable: false,
      } as CoverageReport['run'],
    });

    const { summary } = diffCoverageReports(reportA, reportB);

    expect(summary.overall.delta).toBeLessThan(0);

    const opDelta = summary.byOperation.common.find(
      (d) => d.operationKey === 'getUser'
    );
    expect(opDelta).toBeDefined();
    expect(opDelta && opDelta.delta).toBeLessThan(0);

    expect(
      summary.byOperation.regressions.some((d) => d.operationKey === 'getUser')
    ).toBe(true);

    const newlyUncoveredIds = summary.newlyUncovered
      .map((entry) => entry.to?.id ?? entry.from?.id)
      .filter((id): id is string => !!id)
      .sort();

    // Newly uncovered includes both the regressed target (t2) and
    // the new uncovered target (t3).
    expect(newlyUncoveredIds).toEqual(['t2', 't3']);
  });

  it('handles newer reports with additional optional fields without changing common-universe deltas', () => {
    const baseTargets: CoverageTargetReport[] = [
      makeTarget({
        id: 't1',
        dimension: 'structure',
        operationKey: 'getUser',
        hit: true,
      }),
    ];

    const baseline = makeReport({
      targets: baseTargets,
      run: {
        dimensionsEnabled: ['structure'],
        excludeUnreachable: false,
        operationsScope: undefined,
        selectedOperations: undefined,
      } as CoverageReport['run'],
    });

    const comparison = makeReport({
      targets: baseTargets,
      run: {
        dimensionsEnabled: ['structure'],
        excludeUnreachable: false,
        operationsScope: 'all',
        selectedOperations: undefined,
      } as CoverageReport['run'],
      metrics: {
        ...baseline.metrics,
        thresholds: {
          overall: 0.8,
          byDimension: { structure: 0.8 },
        },
      },
      diagnostics: {
        ...baseline.diagnostics,
        notes: [{ kind: 'info', message: 'extended diagnostics' }],
      },
    });

    const { summary } = diffCoverageReports(baseline, comparison);

    expectDelta(summary.overall, 1, 1);
    expect(summary.operationsOnlyInA).toEqual([]);
    expect(summary.operationsOnlyInB).toEqual([]);
  });
});
