import { describe, it, expect } from 'vitest';
import type { CoverageReport } from '@foundrydata/shared';
import { formatCoverageSummary } from '../coverage/coverage-summary';

function createReport(partial: Partial<CoverageReport>): CoverageReport {
  const base: CoverageReport = {
    version: 'coverage-report/v1',
    reportMode: 'full',
    engine: {
      foundryVersion: '0.0.0',
      coverageMode: 'guided',
      ajvMajor: 8,
    },
    run: {
      seed: 1,
      masterSeed: 1,
      maxInstances: 10,
      actualInstances: 10,
      dimensionsEnabled: ['structure', 'branches', 'enum'],
      excludeUnreachable: true,
      startedAt: '2025-01-01T00:00:00Z',
      durationMs: 1,
    },
    metrics: {
      coverageStatus: 'ok',
      overall: 0.9,
      byDimension: {},
      byOperation: {},
      targetsByStatus: {},
    },
    targets: [],
    uncoveredTargets: [],
    unsatisfiedHints: [],
    diagnostics: {
      plannerCapsHit: [],
      notes: [],
    },
  };

  return {
    ...base,
    ...partial,
    metrics: {
      ...base.metrics,
      ...(partial.metrics ?? {}),
    },
    diagnostics: {
      ...base.diagnostics,
      ...(partial.diagnostics ?? {}),
    },
  };
}

describe('coverage summary formatter', () => {
  it('orders summary as byDimension, byOperation, overall, targetsByStatus, caps/hints', () => {
    const report = createReport({
      metrics: {
        coverageStatus: 'ok',
        overall: 0.85,
        byDimension: {
          branches: 0.7,
          enum: 0.6,
        },
        byOperation: {
          'GET /users': 0.8,
          'POST /users': 0.9,
        },
        targetsByStatus: {
          active: 120,
          unreachable: 5,
        },
      },
      diagnostics: {
        plannerCapsHit: [
          {
            dimension: 'branches',
            scopeType: 'schema',
            scopeKey: '#',
            totalTargets: 10,
            plannedTargets: 8,
            unplannedTargets: 2,
          },
        ],
        notes: [],
      },
      unsatisfiedHints: [
        {
          kind: 'ENUM_VALUE',
          canonPath: '#/kind',
          reasonCode: 'PLANNER_CAP',
        },
      ],
    } as Partial<CoverageReport>);

    const summary = formatCoverageSummary(report);

    expect(summary).toMatch(/coverage by dimension:/);
    expect(summary).toMatch(/coverage by operation:/);
    expect(summary).toMatch(/coverage overall:/);
    expect(summary).toMatch(/targets by status:/);
    expect(summary).toMatch(/planner caps:/);
    expect(summary).toMatch(/unsatisfied hints:/);

    const order = [
      'coverage by dimension:',
      'coverage by operation:',
      'coverage overall:',
      'targets by status:',
      'planner caps:',
      'unsatisfied hints:',
    ];
    const indices = order.map((marker) => summary.indexOf(marker));
    for (let i = 1; i < indices.length; i += 1) {
      const current = indices[i]!;
      const previous = indices[i - 1]!;
      expect(current).toBeGreaterThan(previous);
    }
  });

  it('orders operations in coverage by operation from least to most covered', () => {
    const report = createReport({
      metrics: {
        coverageStatus: 'ok',
        overall: 0.5,
        byDimension: {},
        byOperation: {
          'GET /users': 0.8,
          'POST /users': 0.4,
          'DELETE /users': 0.6,
        },
        targetsByStatus: {},
      },
    });

    const summary = formatCoverageSummary(report);
    const marker = 'coverage by operation:';
    const start = summary.indexOf(marker);
    expect(start).toBeGreaterThanOrEqual(0);

    const line = summary.slice(start);
    const order = ['POST /users', 'DELETE /users', 'GET /users'];
    const indices = order.map((op) => line.indexOf(op));

    for (let i = 1; i < indices.length; i += 1) {
      const current = indices[i]!;
      const previous = indices[i - 1]!;
      expect(current).toBeGreaterThan(previous);
    }
  });
});
