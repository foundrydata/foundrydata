import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

type Timings = {
  normalizeMs: number;
  composeMs: number;
  generateMs: number;
  repairMs: number;
  validateMs: number;
  compileMs?: number;
};

interface ReportSummaryLike {
  totalInstances: number;
  validUnchanged: number;
  validRepaired: number;
  invalid: number;
  timings?: Timings;
}

interface BenchSchemaSummaryLike {
  id: string;
  schemaId: string;
  summary: ReportSummaryLike;
}

interface BenchRunSummaryLike {
  runId: string;
  generatedAt: string;
  schemas: BenchSchemaSummaryLike[];
}

function isBenchRunSummary(value: unknown): value is BenchRunSummaryLike {
  const candidate = value as BenchRunSummaryLike;
  return (
    !!candidate &&
    typeof candidate.runId === 'string' &&
    Array.isArray(candidate.schemas)
  );
}

function isSingleReport(
  value: unknown
): value is { schemaId: string; summary: ReportSummaryLike } {
  const candidate = value as { schemaId?: unknown; summary?: unknown };
  return (
    !!candidate &&
    typeof candidate.schemaId === 'string' &&
    !!candidate.summary &&
    typeof (candidate.summary as ReportSummaryLike).totalInstances === 'number'
  );
}

function formatNumber(value: number | undefined): string {
  if (!Number.isFinite(value ?? NaN)) {
    return 'n/a';
  }
  return `${(value as number).toFixed(2)}ms`;
}

// eslint-disable-next-line max-lines-per-function, complexity
function printTimingsDiff(
  label: string,
  before: ReportSummaryLike | undefined,
  after: ReportSummaryLike | undefined
): void {
  if (!before?.timings && !after?.timings) {
    process.stdout.write(`${label}: no timings available\n`);
    return;
  }

  const beforeTimings = before?.timings;
  const afterTimings = after?.timings;

  const keys: (keyof Timings)[] = [
    'normalizeMs',
    'composeMs',
    'generateMs',
    'repairMs',
    'validateMs',
    'compileMs',
  ];

  process.stdout.write(`\n=== ${label} ===\n`);
  if (before) {
    process.stdout.write(
      `instances(before): total=${before.totalInstances}, valid=${before.validUnchanged}, repaired=${before.validRepaired}, invalid=${before.invalid}\n`
    );
  }
  if (after) {
    process.stdout.write(
      `instances(after):  total=${after.totalInstances}, valid=${after.validUnchanged}, repaired=${after.validRepaired}, invalid=${after.invalid}\n`
    );
  }

  for (const key of keys) {
    const beforeValue = beforeTimings?.[key];
    const afterValue = afterTimings?.[key];
    if (
      !Number.isFinite(beforeValue ?? NaN) &&
      !Number.isFinite(afterValue ?? NaN)
    ) {
      continue;
    }

    const diff =
      Number.isFinite(beforeValue ?? NaN) && Number.isFinite(afterValue ?? NaN)
        ? (afterValue as number) - (beforeValue as number)
        : undefined;

    const speedup =
      diff !== undefined &&
      Number.isFinite(diff) &&
      beforeValue &&
      beforeValue > 0
        ? (afterValue as number) / beforeValue
        : undefined;

    const parts = [
      key.replace(/Ms$/, ''),
      `before=${formatNumber(beforeValue)}`,
      `after=${formatNumber(afterValue)}`,
    ];

    if (diff !== undefined && Number.isFinite(diff)) {
      parts.push(`diff=${diff.toFixed(2)}ms`);
    }
    if (speedup !== undefined && Number.isFinite(speedup)) {
      parts.push(`ratio=${speedup.toFixed(2)}x`);
    }

    process.stdout.write(`- ${parts.join(' · ')}\n`);
  }
}

async function diffBenchSummaries(
  before: BenchRunSummaryLike,
  after: BenchRunSummaryLike,
  schemaIdFilter?: string
): Promise<void> {
  const beforeSchemas = new Map<string, BenchSchemaSummaryLike>();
  for (const entry of before.schemas) {
    beforeSchemas.set(entry.id, entry);
  }

  const ids = new Set<string>();
  for (const entry of before.schemas) {
    ids.add(entry.id);
  }
  for (const entry of after.schemas) {
    ids.add(entry.id);
  }

  const targetIds =
    schemaIdFilter !== undefined ? [schemaIdFilter] : Array.from(ids).sort();

  for (const id of targetIds) {
    const beforeEntry = beforeSchemas.get(id);
    const afterEntry = after.schemas.find((entry) => entry.id === id);
    if (!beforeEntry && !afterEntry) {
      continue;
    }

    const label = `schema "${id}"`;
    printTimingsDiff(label, beforeEntry?.summary, afterEntry?.summary);
  }
}

async function diffSingleReports(
  before: { schemaId: string; summary: ReportSummaryLike },
  after: { schemaId: string; summary: ReportSummaryLike }
): Promise<void> {
  const label =
    before.schemaId === after.schemaId
      ? `schema "${before.schemaId}"`
      : `schemas "${before.schemaId}" (before) vs "${after.schemaId}" (after)`;

  printTimingsDiff(label, before.summary, after.summary);
}

// eslint-disable-next-line max-lines-per-function
async function main(): Promise<void> {
  const [beforePath, afterPath, schemaId] = process.argv.slice(2);
  if (!beforePath || !afterPath) {
    const thisFile = fileURLToPath(import.meta.url);
    process.stderr.write(
      [
        'Usage:',
        `  npx tsx ${path.relative(
          process.cwd(),
          thisFile
        )} <before.json> <after.json> [schemaId]`,
        '',
        'Examples:',
        '  # Diff two bench-summary.json files (all schemas)',
        '  npx tsx scripts/bench-report-diff.ts reports/reporter/bench/bench-reports-20251116/bench-summary.json reports/reporter/bench/bench-reports-with-resolver/bench-summary.json',
        '',
        '  # Diff a specific schema entry inside bench summaries',
        '  npx tsx scripts/bench-report-diff.ts reports/reporter/bench/bench-reports-20251116/bench-summary.json reports/reporter/bench/bench-reports-with-resolver/bench-summary.json real-world-npm-package-schema',
        '',
        '  # Diff two single schema *.report.json files',
        '  npx tsx scripts/bench-report-diff.ts reports/reporter/bench/bench-reports-20251116/real-world-npm-package-schema.report.json reports/reporter/bench/bench-reports-with-resolver/real-world-npm-package-schema.report.json',
        '',
      ].join('\n')
    );
    process.exitCode = 1;
    return;
  }

  const [beforeRaw, afterRaw] = await Promise.all([
    readFile(beforePath, 'utf8'),
    readFile(afterPath, 'utf8'),
  ]);

  const beforeJson = JSON.parse(beforeRaw) as unknown;
  const afterJson = JSON.parse(afterRaw) as unknown;

  if (isBenchRunSummary(beforeJson) && isBenchRunSummary(afterJson)) {
    await diffBenchSummaries(beforeJson, afterJson, schemaId);
    return;
  }

  if (isSingleReport(beforeJson) && isSingleReport(afterJson)) {
    await diffSingleReports(beforeJson, afterJson);
    return;
  }

  process.stderr.write(
    [
      'Unrecognised input shapes.',
      '- Expected both files to be bench-summary.json (BenchRunSummary) or both to be single schema *.report.json.',
      `- before: ${beforePath}`,
      `- after:  ${afterPath}`,
      '',
    ].join('\n')
  );
  process.exitCode = 1;
}

void main();
