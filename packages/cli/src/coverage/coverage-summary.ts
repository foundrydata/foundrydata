import type { CoverageReport } from '@foundrydata/shared';

export function formatCoverageSummary(report: CoverageReport): string {
  const byDimensionEntries = Object.entries(report.metrics.byDimension ?? {});
  const byOperationEntries = Object.entries(report.metrics.byOperation ?? {});
  const overall = report.metrics.overall;
  const targetsByStatus = report.metrics.targetsByStatus ?? {};
  const caps = report.diagnostics.plannerCapsHit ?? [];
  const unsatisfiedHints = report.unsatisfiedHints ?? [];

  const lines: string[] = [];

  if (byDimensionEntries.length > 0) {
    const sorted = [...byDimensionEntries].sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    const parts = sorted.map(([dim, value]) => `${dim}=${value.toFixed(3)}`);
    lines.push(`coverage by dimension: ${parts.join(', ')}`);
  }

  if (byOperationEntries.length > 0) {
    const sorted = [...byOperationEntries].sort((a, b) => a[1] - b[1]);
    const parts = sorted.map(([op, value]) => `${op}=${value.toFixed(3)}`);
    lines.push(`coverage by operation: ${parts.join(', ')}`);
  }

  lines.push(`coverage overall: ${overall.toFixed(3)}`);

  const statusParts = Object.entries(targetsByStatus)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([status, count]) => `${status}=${count}`);
  if (statusParts.length > 0) {
    lines.push(`targets by status: ${statusParts.join(', ')}`);
  }

  const capsCount = caps.length;
  const hintsCount = unsatisfiedHints.length;
  lines.push(`planner caps: ${capsCount}, unsatisfied hints: ${hintsCount}`);

  return lines.join(' | ');
}
