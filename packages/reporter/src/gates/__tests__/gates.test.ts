import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DiagMetrics } from '@foundrydata/shared';
import type { CoverageSummary } from '../../platform-view/index.js';
import { describe, expect, it } from 'vitest';

import { evaluateGates, type GateResult } from '../index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRACE_FIXTURE_PATH = resolve(
  __dirname,
  '../../../test/fixtures/gates.trace.json'
);

const coverageOk: CoverageSummary = {
  coverageStatus: 'ok',
  overall: 0.9,
  thresholds: { overall: 0.8 },
  targetsByStatus: {},
};

function baseMetrics(overrides: Partial<DiagMetrics> = {}): DiagMetrics {
  return {
    normalizeMs: 1,
    composeMs: 1,
    generateMs: 1,
    repairMs: 1,
    validateMs: 1,
    compileMs: 0,
    validationsPerRow: 1,
    repairPassesPerRow: 1,
    repairActionsPerRow: 1,
    branchTrialsTried: 0,
    patternWitnessTried: 0,
    evalTraceChecks: 0,
    evalTraceProved: 0,
    memoryPeakMB: 0,
    p50LatencyMs: 0,
    p95LatencyMs: 0,
    repair_tier1_actions: 0,
    repair_tier2_actions: 0,
    repair_tier3_actions: 0,
    repair_tierDisabled: 0,
    ...overrides,
  };
}

describe('evaluateGates', () => {
  it('fails when fatal diagnostics are present', () => {
    const result = evaluateGates({
      fatalDiagnostics: [{ code: 'X' }],
    });

    expect(result.status).toBe('fail');
    expect(result.issues.some((i) => i.code === 'FATAL_DIAGNOSTICS')).toBe(
      true
    );
  });

  it('warns on warn diagnostics by default and can escalate to fail', () => {
    const warnOnly = evaluateGates({
      warnDiagnostics: [{ code: 'W' }, { code: 'W2' }],
    });
    expect(warnOnly.status).toBe('warn');
    expect(
      warnOnly.issues.find((i) => i.code === 'WARN_DIAGNOSTICS')
    ).toBeDefined();

    const escalated = evaluateGates(
      { warnDiagnostics: [{ code: 'W' }] },
      { warnAsFail: true }
    );
    expect(escalated.status).toBe('fail');
    expect(
      escalated.issues.find(
        (i) => i.code === 'WARN_DIAGNOSTICS' && i.severity === 'fail'
      )
    ).toBeDefined();
  });

  it('fails when coverage status indicates minCoverageNotMet', () => {
    const result = evaluateGates({
      coverage: { ...coverageOk, coverageStatus: 'minCoverageNotMet' },
    });

    expect(result.status).toBe('fail');
    expect(
      result.issues.find((i) => i.code === 'COVERAGE_STATUS')
    ).toBeDefined();
  });

  it('enforces coverage thresholds when provided', () => {
    const failing = evaluateGates(
      {
        coverage: { ...coverageOk, overall: 0.5 },
      },
      { minCoverage: 0.8 }
    );
    expect(failing.status).toBe('fail');
    expect(
      failing.issues.find((i) => i.code === 'COVERAGE_THRESHOLD')
    ).toBeDefined();

    const passing = evaluateGates(
      { coverage: { ...coverageOk, overall: 0.85 } },
      { minCoverage: 0.8 }
    );
    expect(passing.status).toBe('pass');
    expect(passing.issues.length).toBe(0);
  });

  it('warns when a coverage threshold is configured but coverage is unavailable', () => {
    const result = evaluateGates({}, { minCoverage: 0.9 });
    expect(result.status).toBe('warn');
    expect(
      result.issues.find((i) => i.code === 'COVERAGE_UNAVAILABLE')
    ).toBeDefined();
  });

  it('ignores SLIs in metrics when evaluating determinism gates', () => {
    const metrics = baseMetrics({
      p50LatencyMs: 999,
      p95LatencyMs: 999,
      memoryPeakMB: 999,
    });
    const result = evaluateGates({ coverage: coverageOk, metrics });
    expect(result.status).toBe('pass');
    expect(result.issues.length).toBe(0);
  });

  it('matches the trace fixture for representative pass/warn/fail cases', () => {
    const fixture = JSON.parse(
      readFileSync(TRACE_FIXTURE_PATH, 'utf8')
    ) as Record<string, GateResult>;

    const pass = evaluateGates({ coverage: coverageOk });
    expect(pass).toEqual(fixture.pass);

    const warn = evaluateGates({ warnDiagnostics: [{}] });
    expect(warn).toEqual(fixture.warn);

    const fail = evaluateGates(
      {
        fatalDiagnostics: [{}],
        coverage: { ...coverageOk, overall: 0.5 },
      },
      { minCoverage: 0.8 }
    );
    expect(fail).toEqual(fixture.fail);
  });

  it('fails when gValid metrics or diagnostics indicate structural repair', () => {
    const metrics = baseMetrics({
      ['gValid_simpleObjectRequired_actions']: 2,
    });
    const result = evaluateGates({
      metrics,
      warnDiagnostics: [{ code: 'REPAIR_GVALID_STRUCTURAL_ACTION' }],
    });

    expect(result.status).toBe('fail');
    expect(
      result.issues.find((i) => i.code === 'GVALID_REPAIR')?.message
    ).toContain('simpleObjectRequired');
  });

  it('fails when repair regression diagnostics are present', () => {
    const result = evaluateGates({
      repairDiagnostics: [{ code: 'UNSAT_BUDGET_EXHAUSTED' }],
    });

    expect(result.status).toBe('fail');
    expect(
      result.issues.some((issue) => issue.code === 'REPAIR_REGRESSION')
    ).toBe(true);
  });

  it('surfaces planner caps/unplanned coverage as warn or fail depending on thresholds', () => {
    const coverageWithCaps: CoverageSummary = {
      ...coverageOk,
      planning: {
        plannedTargetsTotal: 1,
        unplannedTargetsTotal: 2,
        plannerCapsHit: [
          {
            dimension: 'branches',
            scopeType: 'schema',
            scopeKey: 'dimension:branches',
            totalTargets: 3,
            plannedTargets: 1,
            unplannedTargets: 2,
          },
        ],
      },
    };

    const warnResult = evaluateGates({ coverage: coverageWithCaps });
    expect(warnResult.status).toBe('warn');
    expect(
      warnResult.issues.find((i) => i.code === 'COVERAGE_PLANNING')
    ).toBeDefined();

    const failResult = evaluateGates(
      { coverage: coverageWithCaps },
      { minCoverage: 0.9 }
    );
    expect(failResult.status).toBe('fail');
    expect(
      failResult.issues.find(
        (i) => i.code === 'COVERAGE_PLANNING' && i.severity === 'fail'
      )
    ).toBeDefined();
  });

  it('fails benchmark performance gate when SLIs exceed thresholds', () => {
    const metrics = baseMetrics({
      p95LatencyMs: 130,
      memoryPeakMB: 600,
    });

    const failResult = evaluateGates(
      { coverage: coverageOk, metrics },
      { benchPerf: true }
    );
    expect(failResult.status).toBe('fail');
    expect(
      failResult.issues.find((i) => i.code === 'BENCH_PERF')?.message
    ).toContain('p95LatencyMs');
    expect(
      failResult.issues.find((i) => i.code === 'BENCH_PERF')?.message
    ).toContain('memoryPeakMB');

    const passResult = evaluateGates(
      {
        coverage: coverageOk,
        metrics: baseMetrics({ p95LatencyMs: 80, memoryPeakMB: 256 }),
      },
      { benchPerf: true }
    );
    expect(passResult.status).toBe('pass');
  });
});
