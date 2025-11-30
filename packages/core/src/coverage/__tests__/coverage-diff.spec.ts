import { describe, it, expect } from 'vitest';

import type {
  CoverageDimension,
  CoverageTargetReport,
  CoverageReport,
} from '@foundrydata/shared';
import { COVERAGE_REPORT_VERSION_V1 } from '@foundrydata/shared';

import {
  diffCoverageTargets,
  diffCoverageReports,
  type CoverageMetricDelta,
  checkCoverageDiffCompatibility,
} from '../diff.js';

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

describe('coverage diff targets', () => {
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

describe('coverage diff reports', () => {
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
  });

  it('keeps non-boundaries/non-operations IDs stable when toggling boundaries and operations dimensions', () => {
    const commonTargets: CoverageTargetReport[] = [
      makeTarget({
        id: 's1',
        dimension: 'structure',
        canonPath: '#',
        hit: true,
      }),
      makeTarget({
        id: 'b-struct',
        dimension: 'branches',
        kind: 'ONEOF_BRANCH',
        canonPath: '#/oneOf/0',
        hit: false,
      }),
      makeTarget({
        id: 'e-color',
        dimension: 'enum',
        kind: 'ENUM_VALUE_HIT',
        canonPath: '#/properties/color',
        params: { enumIndex: 0, value: 'red' },
        hit: false,
      }),
    ];

    const boundariesAndOpsTargets: CoverageTargetReport[] = [
      makeTarget({
        id: 'num-min',
        dimension: 'boundaries',
        kind: 'NUMERIC_MIN_HIT',
        canonPath: '#/properties/age',
        params: { boundaryKind: 'minimum', boundaryValue: 0 },
        hit: false,
      }),
      makeTarget({
        id: 'op-req',
        dimension: 'operations',
        kind: 'OP_REQUEST_COVERED',
        canonPath: '#/paths/~1users/get',
        operationKey: 'GET /users',
        hit: false,
      }),
    ];

    const reportStructureOnly = makeReport({
      targets: commonTargets,
      run: {
        dimensionsEnabled: ['structure', 'branches', 'enum'],
        excludeUnreachable: false,
      } as CoverageReport['run'],
    });

    const reportWithBoundariesAndOps = makeReport({
      targets: [...commonTargets, ...boundariesAndOpsTargets],
      run: {
        dimensionsEnabled: [
          'structure',
          'branches',
          'enum',
          'boundaries',
          'operations',
        ],
        excludeUnreachable: false,
      } as CoverageReport['run'],
    });

    const { summary, targets: targetsDiff } = diffCoverageReports(
      reportStructureOnly,
      reportWithBoundariesAndOps
    );

    // IDs for non-boundaries/non-operations remain identical across reports.
    const nonBoundaryNonOpsInA = reportStructureOnly.targets
      .filter(
        (t) => t.dimension !== 'boundaries' && t.dimension !== 'operations'
      )
      .map((t) => t.id)
      .sort();
    const nonBoundaryNonOpsInB = reportWithBoundariesAndOps.targets
      .filter(
        (t) => t.dimension !== 'boundaries' && t.dimension !== 'operations'
      )
      .map((t) => t.id)
      .sort();
    expect(nonBoundaryNonOpsInB).toEqual(nonBoundaryNonOpsInA);

    // Diff marks only boundaries/operations targets as added.
    const addedIds = targetsDiff.targets
      .filter((entry) => entry.kind === 'added')
      .map((entry) => entry.to?.id)
      .filter((id): id is string => !!id)
      .sort();
    expect(addedIds).toEqual(['num-min', 'op-req']);

    // Metrics deltas are computed over the common universe; here structure/branches/enum coverage stays the same.
    expectDelta(summary.overall, 1 / 3, 1 / 3);
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

    const newlyUncoveredIds = summary.newlyUncovered
      .map((entry) => entry.to?.id ?? entry.from?.id)
      .filter((id): id is string => !!id)
      .sort();

    // Newly uncovered includes both the regressed target (t2) and
    // the new uncovered target (t3).
    expect(newlyUncoveredIds).toEqual(['t2', 't3']);
  });
});

describe('coverage diff compatibility checks', () => {
  it('detects coverage-report version mismatch', () => {
    const a = makeReport({ version: 'coverage-report/v1' });
    const b = makeReport({
      version: 'coverage-report/v2',
    } as Partial<CoverageReport>);

    const issues = checkCoverageDiffCompatibility(a, b);
    expect(issues.some((i) => i.kind === 'versionMismatch')).toBe(true);
  });

  it('detects incompatible engine majors', () => {
    const a = makeReport({
      engine: { foundryVersion: '1.2.3', coverageMode: 'measure', ajvMajor: 8 },
    } as Partial<CoverageReport>);
    const b = makeReport({
      engine: { foundryVersion: '2.0.0', coverageMode: 'measure', ajvMajor: 8 },
    } as Partial<CoverageReport>);

    const issues = checkCoverageDiffCompatibility(a, b);
    expect(issues.some((i) => i.kind === 'engineMajorMismatch')).toBe(true);
  });

  it('detects incompatible operationsScope/selectedOperations', () => {
    const base = makeReport();

    const allScope = makeReport({
      run: {
        ...base.run,
        operationsScope: 'all',
        selectedOperations: undefined,
      },
    } as Partial<CoverageReport>);

    const selectedScope = makeReport({
      run: {
        ...base.run,
        operationsScope: 'selected',
        selectedOperations: ['getUser'],
      },
    } as Partial<CoverageReport>);

    const issuesScope = checkCoverageDiffCompatibility(allScope, selectedScope);
    expect(issuesScope.some((i) => i.kind === 'operationsScopeMismatch')).toBe(
      true
    );

    const selectedA = makeReport({
      run: {
        ...base.run,
        operationsScope: 'selected',
        selectedOperations: ['getUser', 'createUser'],
      },
    } as Partial<CoverageReport>);

    const selectedB = makeReport({
      run: {
        ...base.run,
        operationsScope: 'selected',
        selectedOperations: ['getUser'],
      },
    } as Partial<CoverageReport>);

    const issuesSelected = checkCoverageDiffCompatibility(selectedA, selectedB);
    expect(
      issuesSelected.some((i) => i.kind === 'operationsScopeMismatch')
    ).toBe(true);
  });

  it('treats all-scope reports with additional optional fields as compatible', () => {
    const base = makeReport();

    const oldReport = makeReport({
      run: {
        ...base.run,
        operationsScope: undefined,
        selectedOperations: undefined,
      },
    } as Partial<CoverageReport>);

    const newReport = makeReport({
      run: {
        ...base.run,
        operationsScope: 'all',
        selectedOperations: undefined,
      },
      metrics: {
        ...base.metrics,
        thresholds: {
          overall: 0.8,
          byDimension: { structure: 0.8 },
        },
      },
      diagnostics: {
        ...(base.diagnostics as CoverageReport['diagnostics']),
        notes: [{ kind: 'info', message: 'extended diagnostics' }],
      },
    } as Partial<CoverageReport>);

    const issues = checkCoverageDiffCompatibility(oldReport, newReport);
    expect(issues).toHaveLength(0);

    const diff = diffCoverageReports(oldReport, newReport);
    expect(diff.summary.operationsOnlyInA).toEqual([]);
    expect(diff.summary.operationsOnlyInB).toEqual([]);
  });

  it('treats selected operations with different order and duplicates as compatible', () => {
    const base = makeReport();

    const reportA = makeReport({
      run: {
        ...base.run,
        operationsScope: 'selected',
        selectedOperations: ['GET /users', 'POST /users', 'GET /users'],
      },
    } as Partial<CoverageReport>);

    const reportB = makeReport({
      run: {
        ...base.run,
        operationsScope: 'selected',
        selectedOperations: ['POST /users', 'GET /users'],
      },
    } as Partial<CoverageReport>);

    const issues = checkCoverageDiffCompatibility(reportA, reportB);
    expect(issues).toHaveLength(0);
  });
});
