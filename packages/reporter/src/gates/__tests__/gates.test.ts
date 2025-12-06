import type { CoverageSummary } from '../../platform-view/index.js';
import { describe, expect, it } from 'vitest';

import { evaluateGates } from '../index.js';

const coverageOk: CoverageSummary = {
  coverageStatus: 'ok',
  overall: 0.9,
  thresholds: { overall: 0.8 },
  targetsByStatus: {},
};

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
});
