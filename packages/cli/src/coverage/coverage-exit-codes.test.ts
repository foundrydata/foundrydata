import { describe, expect, it, vi } from 'vitest';

import type { CoverageReport } from '@foundrydata/shared';
import {
  COVERAGE_FAILURE_EXIT_CODE,
  enforceCoverageThreshold,
  formatCoverageFailureMessage,
} from './coverage-exit-codes.js';

function makeCoverageReport(
  coverageStatus: CoverageReport['metrics']['coverageStatus'],
  overall: number,
  threshold: number
): CoverageReport {
  return {
    version: 'coverage-report/v1',
    reportMode: 'full',
    engine: {
      foundryVersion: '0.1.0',
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
      startedAt: '2025-01-01T00:00:00.000Z',
      durationMs: 0,
    },
    metrics: {
      coverageStatus,
      overall,
      byDimension: {},
      byOperation: {},
      targetsByStatus: { active: 1 },
      thresholds: { overall: threshold },
    },
    targets: [],
    uncoveredTargets: [],
    unsatisfiedHints: [],
    diagnostics: {
      plannerCapsHit: [],
      notes: [],
    },
  };
}

describe('enforceCoverageThreshold', () => {
  it('ignores reports that do not violate minCoverage', () => {
    const report = makeCoverageReport('ok', 0.8, 0.9);
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);

    try {
      enforceCoverageThreshold(report);
      enforceCoverageThreshold(undefined);
      expect(stderrSpy).not.toHaveBeenCalled();
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      stderrSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it('exits with the coverage failure code when minCoverage is not met', () => {
    const report = makeCoverageReport('minCoverageNotMet', 0.5, 0.9);
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);

    try {
      enforceCoverageThreshold(report);
      expect(stderrSpy).toHaveBeenCalledWith(
        formatCoverageFailureMessage(report)
      );
      expect(exitSpy).toHaveBeenCalledWith(COVERAGE_FAILURE_EXIT_CODE);
    } finally {
      stderrSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });
});
