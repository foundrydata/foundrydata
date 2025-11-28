import { describe, it, expect } from 'vitest';

import type {
  CoverageDimension,
  CoverageTargetReport,
} from '@foundrydata/shared';
import {
  applyReportModeToCoverageTargets,
  evaluateCoverage,
} from '../evaluator.js';

function makeTarget(
  overrides: Partial<CoverageTargetReport> = {}
): CoverageTargetReport {
  const kind = overrides.kind ?? 'SCHEMA_NODE';
  const status =
    overrides.status ??
    (kind === 'SCHEMA_REUSED_COVERED' ? 'deprecated' : undefined);

  const base = {
    id: overrides.id ?? 't',
    dimension: (overrides.dimension ?? 'structure') as CoverageDimension,
    kind: kind as CoverageTargetReport['kind'],
    canonPath: overrides.canonPath ?? '#',
    status,
    params: overrides.params,
    operationKey: overrides.operationKey,
    weight: overrides.weight,
    polarity: overrides.polarity,
    meta: overrides.meta,
    hit: overrides.hit ?? false,
  } as CoverageTargetReport;

  return base;
}

describe('evaluateCoverage', () => {
  it('computes overall, byDimension and uncoveredTargets for simple inputs', () => {
    const targets: CoverageTargetReport[] = [
      makeTarget({
        id: 's1',
        dimension: 'structure',
        hit: true,
      }),
      makeTarget({
        id: 's2',
        dimension: 'structure',
        hit: false,
      }),
      makeTarget({
        id: 'b1',
        dimension: 'branches',
        kind: 'ONEOF_BRANCH',
        hit: true,
      }),
    ];

    const { metrics, uncoveredTargets } = evaluateCoverage({
      targets,
      dimensionsEnabled: ['structure', 'branches'],
      excludeUnreachable: false,
    });

    expect(metrics.overall).toBeCloseTo(2 / 3, 6);
    expect(metrics.byDimension.structure).toBeCloseTo(1 / 2, 6);
    expect(metrics.byDimension.branches).toBeCloseTo(1, 6);

    expect(metrics.targetsByStatus.active).toBe(3);
    expect(metrics.targetsByStatus.unreachable).toBe(0);
    expect(metrics.targetsByStatus.deprecated).toBe(0);

    expect(uncoveredTargets.map((t) => t.id)).toEqual(['s2']);
    expect(Object.keys(metrics.byOperation).length).toBe(0);
    expect(metrics.coverageStatus).toBe('ok');
  });

  it('respects excludeUnreachable when computing denominators', () => {
    const targets: CoverageTargetReport[] = [
      makeTarget({
        id: 'a1',
        dimension: 'structure',
        status: 'active',
        hit: true,
      }),
      makeTarget({
        id: 'u1',
        dimension: 'structure',
        status: 'unreachable',
        hit: false,
      }),
      makeTarget({
        id: 'd1',
        dimension: 'structure',
        status: 'deprecated',
        hit: false,
      }),
    ];

    const dims: CoverageDimension[] = ['structure'];

    const withExclude = evaluateCoverage({
      targets,
      dimensionsEnabled: dims,
      excludeUnreachable: true,
    });

    expect(withExclude.metrics.overall).toBeCloseTo(1, 6);
    expect(withExclude.metrics.byDimension.structure).toBeCloseTo(1, 6);

    const withoutExclude = evaluateCoverage({
      targets,
      dimensionsEnabled: dims,
      excludeUnreachable: false,
    });

    expect(withoutExclude.metrics.overall).toBeCloseTo(1 / 2, 6);
    expect(withoutExclude.metrics.byDimension.structure).toBeCloseTo(1 / 2, 6);

    expect(withoutExclude.metrics.targetsByStatus.active).toBe(1);
    expect(withoutExclude.metrics.targetsByStatus.unreachable).toBe(1);
    expect(withoutExclude.metrics.targetsByStatus.deprecated).toBe(1);

    const uncoveredIds = withoutExclude.uncoveredTargets.map((t) => t.id);
    expect(uncoveredIds).toContain('u1');
    expect(uncoveredIds).not.toContain('a1');
  });

  it('treats diagnostic-only targets as metrics-excluded but still uncovered when hit is false', () => {
    const targets: CoverageTargetReport[] = [
      makeTarget({
        id: 's1',
        dimension: 'structure',
        status: 'active',
        hit: true,
      }),
      makeTarget({
        id: 'diag1',
        dimension: 'operations',
        kind: 'SCHEMA_REUSED_COVERED',
        status: 'deprecated',
        hit: false,
      }),
    ];

    const { metrics, uncoveredTargets } = evaluateCoverage({
      targets,
      dimensionsEnabled: ['structure', 'operations'],
      excludeUnreachable: false,
      thresholds: { overall: 0.5 },
    });

    expect(metrics.overall).toBeCloseTo(1, 6);
    expect(metrics.byDimension.structure).toBeCloseTo(1, 6);
    expect(metrics.byDimension.operations).toBeUndefined();

    expect(metrics.coverageStatus).toBe('ok');
    expect(metrics.targetsByStatus.active).toBe(1);
    expect(metrics.targetsByStatus.deprecated).toBe(1);

    const uncoveredIds = uncoveredTargets.map((t) => t.id);
    expect(uncoveredIds).toEqual(['diag1']);
  });

  it('computes byOperation as a projection over eligible targets', () => {
    const targets: CoverageTargetReport[] = [
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

    const { metrics, uncoveredTargets } = evaluateCoverage({
      targets,
      dimensionsEnabled: ['structure', 'branches'],
      excludeUnreachable: false,
    });

    expect(metrics.byOperation['createUser']).toBeCloseTo(0, 6);
    expect(metrics.byOperation['getUser']).toBeCloseTo(1 / 2, 6);

    const uncoveredIds = uncoveredTargets.map((t) => t.id).sort();
    expect(uncoveredIds).toEqual(['t2', 't3']);
  });

  it('sets coverageStatus to minCoverageNotMet when overall is below thresholds.overall', () => {
    const targets: CoverageTargetReport[] = [
      makeTarget({
        id: 't1',
        dimension: 'structure',
        hit: true,
      }),
      makeTarget({
        id: 't2',
        dimension: 'structure',
        hit: false,
      }),
    ];

    const { metrics } = evaluateCoverage({
      targets,
      dimensionsEnabled: ['structure'],
      excludeUnreachable: false,
      thresholds: { overall: 0.8 },
    });

    expect(metrics.overall).toBeCloseTo(0.5, 6);
    expect(metrics.coverageStatus).toBe('minCoverageNotMet');
    expect(metrics.thresholds?.overall).toBe(0.8);
  });

  it('keeps full targets and sorts uncoveredTargets deterministically in full reportMode', () => {
    const targets: CoverageTargetReport[] = [
      makeTarget({
        id: 'lowWeightStructure',
        dimension: 'structure',
        weight: 1,
        kind: 'SCHEMA_NODE',
        canonPath: '#/b',
        hit: false,
      }),
      makeTarget({
        id: 'highWeightBranches',
        dimension: 'branches',
        weight: 10,
        kind: 'ONEOF_BRANCH',
        canonPath: '#/a',
        hit: false,
      }),
      makeTarget({
        id: 'lowWeightBranches',
        dimension: 'branches',
        weight: 5,
        kind: 'ONEOF_BRANCH',
        canonPath: '#/z',
        hit: false,
      }),
    ];

    const { uncoveredTargets } = evaluateCoverage({
      targets,
      dimensionsEnabled: ['structure', 'branches'],
      excludeUnreachable: false,
    });

    const reportArrays = applyReportModeToCoverageTargets({
      reportMode: 'full',
      targets,
      uncoveredTargets,
    });

    expect(reportArrays.targets).toBe(targets);
    expect(reportArrays.uncoveredTargets.map((t) => t.id)).toEqual([
      'highWeightBranches',
      'lowWeightBranches',
      'lowWeightStructure',
    ]);
  });

  it('omits targets and truncates uncoveredTargets in summary reportMode', () => {
    const targets: CoverageTargetReport[] = [];
    const uncovered: CoverageTargetReport[] = [];

    for (let i = 0; i < 205; i++) {
      const dimension: CoverageDimension =
        i % 2 === 0 ? 'structure' : 'branches';
      const target = makeTarget({
        id: `t${i}`,
        dimension,
        hit: false,
      });
      targets.push(target);
      uncovered.push(target);
    }

    const first = applyReportModeToCoverageTargets({
      reportMode: 'summary',
      targets,
      uncoveredTargets: uncovered,
    });

    expect(first.targets).toEqual([]);
    expect(first.uncoveredTargets.length).toBe(200);

    const second = applyReportModeToCoverageTargets({
      reportMode: 'summary',
      targets,
      uncoveredTargets: uncovered,
    });

    expect(second.targets).toEqual([]);
    expect(second.uncoveredTargets.map((t) => t.id)).toEqual(
      first.uncoveredTargets.map((t) => t.id)
    );
  });
});
