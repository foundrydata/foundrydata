/* eslint-disable max-lines */
import type { DiagMetrics } from '@foundrydata/shared';

import type { CoverageSummary } from '../platform-view/index.js';

export type GateIssueCode =
  | 'FATAL_DIAGNOSTICS'
  | 'WARN_DIAGNOSTICS'
  | 'COVERAGE_THRESHOLD'
  | 'COVERAGE_STATUS'
  | 'COVERAGE_UNAVAILABLE'
  | 'GVALID_REPAIR'
  | 'COVERAGE_PLANNING'
  | 'REPAIR_REGRESSION'
  | 'BENCH_PERF';

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
  /**
   * Enable benchmark performance gates (bench harness only).
   */
  benchPerf?: boolean;
  /**
   * Thresholds for benchmark performance gates. Defaults follow benchGate.schema.
   */
  perfThresholds?: {
    p95LatencyMs?: number;
    memoryPeakMB?: number;
  };
}

export interface GateSignals {
  fatalDiagnostics?: unknown[];
  warnDiagnostics?: unknown[];
  repairDiagnostics?: unknown[];
  metrics?: DiagMetrics;
  coverage?: CoverageSummary;
}

export function evaluateGates(
  signals: GateSignals,
  config: GateConfig = {}
): GateResult {
  const issues: GateIssue[] = collectDiagnosticIssues(signals, config);
  evaluateCoverage(signals.coverage, config, issues);
  evaluateGValid(signals, issues);
  evaluateRepairRegressions(signals, issues);
  evaluateBenchPerf(signals, config, issues);

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

  evaluateCoveragePlanning(coverage, config, issues);
}

function evaluateCoveragePlanning(
  coverage: CoverageSummary | undefined,
  config: GateConfig,
  issues: GateIssue[]
): void {
  const planning = coverage?.planning;
  if (!planning) return;
  const capsCount = planning.plannerCapsHit?.length ?? 0;
  const unplanned = planning.unplannedTargetsTotal ?? 0;
  if (capsCount + unplanned === 0) return;

  const severity: GateIssue['severity'] =
    config.minCoverage !== undefined ? 'fail' : 'warn';
  const messageParts = [
    `plannerCapsHit=${capsCount}`,
    `unplannedTargetsTotal=${unplanned}`,
  ];

  issues.push({
    code: 'COVERAGE_PLANNING',
    severity,
    message: messageParts.join('; '),
  });
}

function evaluateGValid(signals: GateSignals, issues: GateIssue[]): void {
  const motifs = new Set<string>();

  const fatalCodes = collectDiagCodes(signals.fatalDiagnostics);
  const warnCodes = collectDiagCodes(signals.warnDiagnostics);
  const diagHasGvalid =
    fatalCodes.has('REPAIR_GVALID_STRUCTURAL_ACTION') ||
    warnCodes.has('REPAIR_GVALID_STRUCTURAL_ACTION');

  if (diagHasGvalid) {
    motifs.add('structural');
  }

  const metricsMotifs = collectGValidMetricMotifs(signals.metrics);
  for (const motif of metricsMotifs) {
    motifs.add(motif);
  }

  if (motifs.size === 0) return;

  const sorted = Array.from(motifs).sort();
  issues.push({
    code: 'GVALID_REPAIR',
    severity: 'fail',
    message: `G_valid repair detected for motif(s): ${sorted.join(', ')}`,
  });
}

function evaluateRepairRegressions(
  signals: GateSignals,
  issues: GateIssue[]
): void {
  const regressionCodes = new Set<string>();
  for (const source of [
    signals.fatalDiagnostics,
    signals.warnDiagnostics,
    signals.repairDiagnostics,
  ]) {
    const codes = collectDiagCodes(source);
    if (codes.has('UNSAT_BUDGET_EXHAUSTED')) {
      regressionCodes.add('UNSAT_BUDGET_EXHAUSTED');
    }
    if (codes.has('REPAIR_REVERTED_NO_PROGRESS')) {
      regressionCodes.add('REPAIR_REVERTED_NO_PROGRESS');
    }
  }

  if (regressionCodes.size === 0) {
    return;
  }

  const message = Array.from(regressionCodes).sort().join(', ');

  issues.push({
    code: 'REPAIR_REGRESSION',
    severity: 'fail',
    message: `Repair regressions detected: ${message}`,
  });
}

function collectDiagCodes(diagnostics?: unknown[]): Set<string> {
  if (!Array.isArray(diagnostics)) return new Set();
  const codes = new Set<string>();
  for (const diag of diagnostics) {
    if (
      diag &&
      typeof diag === 'object' &&
      'code' in diag &&
      typeof (diag as { code?: unknown }).code === 'string'
    ) {
      codes.add((diag as { code: string }).code);
    }
  }
  return codes;
}

export function formatGateSummary(result: GateResult): string {
  if (!result.issues.length) {
    return 'no issues';
  }
  return result.issues
    .map((issue) => {
      const message =
        issue.message && issue.message.length > 0 ? ` (${issue.message})` : '';
      return `${issue.severity}:${issue.code}${message}`;
    })
    .join('; ');
}

function collectGValidMetricMotifs(metrics?: DiagMetrics): Set<string> {
  const motifs = new Set<string>();
  if (!metrics) return motifs;

  for (const [key, value] of Object.entries(metrics)) {
    if (typeof value !== 'number' || value <= 0) continue;
    const match = /^gValid_(.+)_(itemsWithRepair|actions)$/.exec(key);
    if (!match) continue;
    motifs.add(match[1] ?? 'unknown');
  }
  return motifs;
}

// eslint-disable-next-line complexity
function evaluateBenchPerf(
  signals: GateSignals,
  config: GateConfig,
  issues: GateIssue[]
): void {
  if (!config.benchPerf) return;
  const metrics = signals.metrics;
  const thresholds = {
    p95LatencyMs: config.perfThresholds?.p95LatencyMs ?? 120,
    memoryPeakMB: config.perfThresholds?.memoryPeakMB ?? 512,
  };
  if (!metrics) {
    issues.push({
      code: 'BENCH_PERF',
      severity: 'warn',
      message: 'Performance metrics unavailable for bench gate evaluation',
    });
    return;
  }
  const perfIssues: string[] = [];
  if (
    typeof metrics.p95LatencyMs === 'number' &&
    metrics.p95LatencyMs > thresholds.p95LatencyMs
  ) {
    perfIssues.push(
      `p95LatencyMs ${metrics.p95LatencyMs} > ${thresholds.p95LatencyMs}`
    );
  }
  if (
    typeof metrics.memoryPeakMB === 'number' &&
    metrics.memoryPeakMB > thresholds.memoryPeakMB
  ) {
    perfIssues.push(
      `memoryPeakMB ${metrics.memoryPeakMB} > ${thresholds.memoryPeakMB}`
    );
  }
  if (!perfIssues.length) return;
  issues.push({
    code: 'BENCH_PERF',
    severity: 'fail',
    message: perfIssues.join('; '),
  });
}
