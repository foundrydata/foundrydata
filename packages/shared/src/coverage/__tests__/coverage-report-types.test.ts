import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  COVERAGE_REPORT_MODES,
  COVERAGE_REPORT_VERSION_V1,
} from '../../types/coverage-report.js';
import type {
  CoverageReport,
  CoverageReportEngine,
  CoverageReportRun,
  CoverageReportStatus,
  CoverageThresholds,
  PlannerCapHit,
  UnsatisfiedHintReasonCode,
} from '../../types/coverage-report.js';
import { COVERAGE_DIMENSIONS, COVERAGE_STATUSES } from '../index';

describe('coverage report types (shared)', () => {
  it('exposes the expected coverage report version and modes', () => {
    expect(COVERAGE_REPORT_VERSION_V1).toBe('coverage-report/v1');
    expect(COVERAGE_REPORT_MODES).toEqual(['full', 'summary']);
  });

  it('aligns PlannerCapHit with coverage dimensions and counts', () => {
    const firstDimension = COVERAGE_DIMENSIONS[0] ?? 'structure';

    const cap: PlannerCapHit = {
      dimension: firstDimension,
      scopeType: 'schema',
      scopeKey: '#',
      totalTargets: 10,
      plannedTargets: 8,
      unplannedTargets: 2,
    };

    expect(cap.totalTargets).toBe(10);
    expect(cap.plannedTargets + cap.unplannedTargets).toBe(10);
  });

  it('defines the expected unsatisfied hint reason codes', () => {
    expectTypeOf<UnsatisfiedHintReasonCode>().toEqualTypeOf<
      | 'CONFLICTING_CONSTRAINTS'
      | 'REPAIR_MODIFIED_VALUE'
      | 'UNREACHABLE_BRANCH'
      | 'PLANNER_CAP'
      | 'INTERNAL_ERROR'
      | 'UNKNOWN'
    >();
  });

  it('models CoverageReport engine and run metadata consistently', () => {
    const engine: CoverageReportEngine = {
      foundryVersion: '1.2.3',
      coverageMode: 'guided',
      ajvMajor: 8,
    };

    const run: CoverageReportRun = {
      seed: 42,
      masterSeed: 42,
      maxInstances: 1000,
      actualInstances: 900,
      dimensionsEnabled: [...COVERAGE_DIMENSIONS],
      excludeUnreachable: true,
      startedAt: new Date().toISOString(),
      durationMs: 350,
      operationsScope: 'all',
    };

    expect(engine.coverageMode).toBe('guided');
    expect(run.dimensionsEnabled).toEqual(COVERAGE_DIMENSIONS);
  });

  it('represents thresholds and targetsByStatus according to the spec', () => {
    expectTypeOf<CoverageThresholds>().toEqualTypeOf<{
      overall?: number;
      byDimension?: Record<string, number>;
      byOperation?: Record<string, number>;
    }>();

    type TargetsByStatus = CoverageReport['metrics']['targetsByStatus'];

    expectTypeOf<TargetsByStatus>().toEqualTypeOf<Record<string, number>>();
  });

  it('encodes coverageStatus as a small, explicit enum', () => {
    expectTypeOf<CoverageReportStatus>().toEqualTypeOf<
      'ok' | 'minCoverageNotMet'
    >();
  });

  it('is compatible with CoverageTargetReport and statuses', () => {
    type Targets = CoverageReport['targets'][number];

    expectTypeOf<Targets['status']>().toEqualTypeOf<
      (typeof COVERAGE_STATUSES)[number] | undefined
    >();
  });
});
