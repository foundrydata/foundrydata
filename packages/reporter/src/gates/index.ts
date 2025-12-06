import type { DiagMetrics } from '@foundrydata/shared';

import type { CoverageSummary } from '../platform-view/index.js';

export type GateIssueCode =
  | 'FATAL_DIAGNOSTICS'
  | 'WARN_DIAGNOSTICS'
  | 'COVERAGE_THRESHOLD'
  | 'COVERAGE_STATUS'
  | 'COVERAGE_UNAVAILABLE';

export type GateIssue = {
  code: GateIssueCode;
  severity: 'fail' | 'warn';
  message: string;
};

export type GateResultStatus = 'pass' | 'warn' | 'fail';

export interface GateResult {
  status: GateResultStatus;
  issues: GateIssue[];
}

export interface GateConfig {
  /**
   * When true, warn-level diagnostics are escalated to failures.
   */
  warnAsFail?: boolean;
  /**
   * Optional minimum coverage threshold to enforce when a coverage
   * summary is provided. Falls back to coverage.thresholds.overall.
   */
  minCoverage?: number;
}

export interface GateSignals {
  fatalDiagnostics?: unknown[];
  warnDiagnostics?: unknown[];
  metrics?: DiagMetrics;
  coverage?: CoverageSummary;
}

export function evaluateGates(
  signals: GateSignals,
  config: GateConfig = {}
): GateResult {
  const issues: GateIssue[] = collectDiagnosticIssues(signals, config);
  evaluateCoverage(signals.coverage, config, issues);

  // Explicitly ignore SLIs (p50/p95/memory) for determinism: no gate logic here.
  void signals.metrics;

  const hasFail = issues.some((issue) => issue.severity === 'fail');
  const hasWarn = issues.some((issue) => issue.severity === 'warn');
  const status: GateResultStatus = hasFail ? 'fail' : hasWarn ? 'warn' : 'pass';

  return { status, issues };
}

function collectDiagnosticIssues(
  signals: GateSignals,
  config: GateConfig
): GateIssue[] {
  const issues: GateIssue[] = [];
  const fatalCount = signals.fatalDiagnostics?.length ?? 0;
  const warnCount = signals.warnDiagnostics?.length ?? 0;

  if (fatalCount > 0) {
    issues.push({
      code: 'FATAL_DIAGNOSTICS',
      severity: 'fail',
      message: `${fatalCount} fatal diagnostic(s) present`,
    });
  }

  if (warnCount > 0) {
    issues.push({
      code: 'WARN_DIAGNOSTICS',
      severity: config.warnAsFail ? 'fail' : 'warn',
      message: `${warnCount} warn diagnostic(s) present`,
    });
  }
  return issues;
}

function evaluateCoverage(
  coverage: CoverageSummary | undefined,
  config: GateConfig,
  issues: GateIssue[]
): void {
  if (!coverage) {
    if (config.minCoverage !== undefined) {
      issues.push({
        code: 'COVERAGE_UNAVAILABLE',
        severity: 'warn',
        message:
          'Coverage summary unavailable; minCoverage configured but no coverage data provided',
      });
    }
    return;
  }

  if (coverage.coverageStatus === 'minCoverageNotMet') {
    issues.push({
      code: 'COVERAGE_STATUS',
      severity: 'fail',
      message: 'Coverage status is minCoverageNotMet',
    });
  }

  const threshold =
    config.minCoverage ?? coverage.thresholds?.overall ?? undefined;
  if (threshold !== undefined && coverage.overall !== undefined) {
    if (coverage.overall < threshold) {
      issues.push({
        code: 'COVERAGE_THRESHOLD',
        severity: 'fail',
        message: `Overall coverage ${coverage.overall} below threshold ${threshold}`,
      });
    }
  }
}
