import { ErrorCode, getExitCode } from '@foundrydata/core';
import type { CoverageReport } from '@foundrydata/shared';

export const COVERAGE_FAILURE_EXIT_CODE = getExitCode(
  ErrorCode.COVERAGE_THRESHOLD_NOT_MET
);

export function formatCoverageFailureMessage(report: CoverageReport): string {
  const threshold = report.metrics.thresholds?.overall;
  const thresholdLabel =
    typeof threshold === 'number' ? threshold.toFixed(3) : 'unknown';
  return `[foundrydata] coverage status: minCoverageNotMet (overall ${report.metrics.overall.toFixed(
    3
  )} < minCoverage ${thresholdLabel})\n`;
}

export function enforceCoverageThreshold(report?: CoverageReport): void {
  if (!report) return;

  if (report.metrics.coverageStatus !== 'minCoverageNotMet') {
    return;
  }

  process.stderr.write(formatCoverageFailureMessage(report));
  process.exit(COVERAGE_FAILURE_EXIT_CODE);
}
