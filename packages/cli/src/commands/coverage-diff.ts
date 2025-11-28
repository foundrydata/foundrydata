import fs from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';

import type { CoverageReport } from '@foundrydata/shared';
import { COVERAGE_REPORT_VERSION_V1 } from '@foundrydata/shared';
import {
  diffCoverageReports,
  type CoverageReportsDiff,
  checkCoverageDiffCompatibility,
} from '@foundrydata/core';

export interface CoverageDiffOptions {
  baseline?: string;
  comparison?: string;
  failOnRegression?: boolean;
}

// eslint-disable-next-line max-lines-per-function
export function registerCoverageDiffCommand(program: Command): void {
  const coverage = program
    .command('coverage')
    .description('Coverage utilities');

  coverage
    .command('diff')
    .description(
      'Compare two coverage-report/v1 JSON files and highlight regressions'
    )
    .argument('<baseline>', 'Baseline coverage report (JSON file)')
    .argument('<comparison>', 'Comparison coverage report (JSON file)')
    .option(
      '--fail-on-regression',
      'Exit with non-zero code when regressions or new gaps are detected',
      true
    )
    .action(
      async (
        baselinePath: string,
        comparisonPath: string,
        options: CoverageDiffOptions
      ) => {
        const resolvedBaseline = resolvePath(baselinePath);
        const resolvedComparison = resolvePath(comparisonPath);

        const baseline = readCoverageReport(resolvedBaseline);
        const comparison = readCoverageReport(resolvedComparison);

        const compatibilityIssues = checkCoverageDiffCompatibility(
          baseline,
          comparison
        );
        if (compatibilityIssues.length > 0) {
          const details = compatibilityIssues.map((issue) => issue.message);
          throw new Error(
            `Coverage reports are incompatible for diff: ${details.join('; ')}`
          );
        }

        const diff = diffCoverageReports(baseline, comparison);

        const summaryText = formatCoverageDiffSummary(diff);
        process.stdout.write(summaryText + '\n');

        if (options.failOnRegression !== false) {
          const hasRegressionOrNewGaps = hasRegressionsOrNewGaps(diff);
          if (hasRegressionOrNewGaps) {
            process.exitCode = 1;
          }
        }
      }
    );
}

function resolvePath(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

function readCoverageReport(filePath: string): CoverageReport {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Coverage report file not found: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in coverage report ${filePath}: ${message}`);
  }

  const report = parsed as CoverageReport;
  if (report.version !== COVERAGE_REPORT_VERSION_V1) {
    throw new Error(
      `Unsupported coverage report version for diff: expected ${COVERAGE_REPORT_VERSION_V1}, got ${report.version}`
    );
  }

  return report;
}

// eslint-disable-next-line max-lines-per-function, complexity
function formatCoverageDiffSummary(diff: CoverageReportsDiff): string {
  const lines: string[] = [];

  const overall = diff.summary.overall;
  lines.push('coverage diff:');
  lines.push(
    `  overall: from=${overall.from.toFixed(3)} to=${overall.to.toFixed(3)} delta=${overall.delta.toFixed(3)}`
  );

  if (diff.summary.byOperation.common.length > 0) {
    lines.push('  per-operation:');
    for (const entry of diff.summary.byOperation.common) {
      lines.push(
        `    ${entry.operationKey}: from=${entry.from.toFixed(3)} to=${entry.to.toFixed(3)} delta=${entry.delta.toFixed(3)}`
      );
    }
  }

  if (diff.summary.byOperation.regressions.length > 0) {
    lines.push('  regressions:');
    for (const entry of diff.summary.byOperation.regressions) {
      lines.push(
        `    ${entry.operationKey}: from=${entry.from.toFixed(3)} to=${entry.to.toFixed(3)} delta=${entry.delta.toFixed(3)}`
      );
    }
  }

  if (diff.summary.byOperation.improvements.length > 0) {
    lines.push('  improvements:');
    for (const entry of diff.summary.byOperation.improvements) {
      lines.push(
        `    ${entry.operationKey}: from=${entry.from.toFixed(3)} to=${entry.to.toFixed(3)} delta=${entry.delta.toFixed(3)}`
      );
    }
  }

  if (
    diff.summary.operationsOnlyInA.length > 0 ||
    diff.summary.operationsOnlyInB.length > 0
  ) {
    lines.push('  operations-changed:');
    if (diff.summary.operationsOnlyInA.length > 0) {
      lines.push(
        `    only-in-baseline: ${diff.summary.operationsOnlyInA.join(', ')}`
      );
    }
    if (diff.summary.operationsOnlyInB.length > 0) {
      lines.push(
        `    only-in-comparison: ${diff.summary.operationsOnlyInB.join(', ')}`
      );
    }
  }

  if (diff.summary.newlyUncovered.length > 0) {
    lines.push('  newly-uncovered-targets:');
    for (const entry of diff.summary.newlyUncovered) {
      const target = entry.to ?? entry.from;
      if (!target) continue;
      const opKey = target.operationKey ? ` ${target.operationKey}` : '';
      lines.push(
        `    [${target.dimension}]${opKey} ${target.kind} at ${target.canonPath} (id=${target.id})`
      );
    }
  }

  const statusChanges = diff.targets.targets.filter((entry) => {
    if (entry.kind !== 'statusChanged' || !entry.from || !entry.to) {
      return false;
    }
    const fromStatus = entry.from.status ?? 'active';
    const toStatus = entry.to.status ?? 'active';
    return fromStatus !== toStatus;
  });

  if (statusChanges.length > 0) {
    lines.push('  status-changes:');
    for (const entry of statusChanges) {
      const from = entry.from!;
      const to = entry.to!;
      const fromStatus = from.status ?? 'active';
      const toStatus = to.status ?? 'active';
      const opKey = to.operationKey ? ` ${to.operationKey}` : '';
      lines.push(
        `    [${to.dimension}]${opKey} ${to.kind} at ${to.canonPath} (id=${to.id}): ${fromStatus} -> ${toStatus}`
      );
    }
  }

  return lines.join('\n');
}

function hasRegressionsOrNewGaps(diff: CoverageReportsDiff): boolean {
  if (diff.summary.overall.delta < 0) {
    return true;
  }

  if (diff.summary.byOperation.regressions.length > 0) {
    return true;
  }

  if (diff.summary.newlyUncovered.length > 0) {
    return true;
  }

  return false;
}
