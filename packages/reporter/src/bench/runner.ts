/* eslint-disable max-lines-per-function, max-lines */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join, basename } from 'node:path';
import { createRequire } from 'node:module';

import type {
  BenchConfig,
  BenchConfigEntry,
  BenchRunSummary,
  BenchSchemaSummary,
  BenchTotals,
  BenchLevel,
} from './types.js';
import type { Report, PlanOptions, ReportSummary } from '../model/report.js';
import { runEngineOnSchema } from '../engine/runner.js';
import { renderMarkdownReport } from '../render/markdown.js';
import { renderHtmlReport } from '../render/html.js';

const requireJson = createRequire(import.meta.url);
const reporterPkg = requireJson('../../package.json') as {
  name?: string;
  version?: string;
};

export interface BenchRunOptions {
  configPath: string;
  outDir: string;
  format: string[];
  seed?: number;
}

export async function runBench(
  options: BenchRunOptions
): Promise<BenchRunSummary> {
  const config = await loadBenchConfig(options.configPath);
  if (!config.length) {
    throw new Error('Bench config is empty.');
  }
  const normalizedFormats = normalizeFormats(options.format);
  const outDir = resolve(options.outDir);
  await mkdir(outDir, { recursive: true });

  const schemaSummaries: BenchSchemaSummary[] = [];
  let toolName = reporterPkg.name ?? 'json-schema-reporter';
  let toolVersion = reporterPkg.version ?? '0.0.0';
  let engineVersion: string | undefined;

  for (const entry of config) {
    const result = await processBenchEntry({
      entry,
      outDir,
      formats: normalizedFormats,
      defaultSeed: options.seed,
    });
    toolName = result.meta.toolName ?? toolName;
    toolVersion = result.meta.toolVersion ?? toolVersion;
    engineVersion = result.meta.engineVersion ?? engineVersion;
    schemaSummaries.push(result.summary);
  }

  const totals = aggregateTotals(schemaSummaries);
  const generatedAt = new Date().toISOString();
  const summary: BenchRunSummary = {
    runId: generatedAt,
    generatedAt,
    toolName,
    toolVersion,
    engineVersion,
    configPath: resolve(options.configPath),
    outDir,
    schemas: schemaSummaries,
    totals,
  };

  await writeFile(
    join(outDir, 'bench-summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8'
  );

  return summary;
}

interface ProcessBenchEntryOptions {
  entry: BenchConfigEntry;
  outDir: string;
  formats: string[];
  defaultSeed?: number;
}

interface ProcessBenchEntryResult {
  summary: BenchSchemaSummary;
  meta: { toolName?: string; toolVersion?: string; engineVersion?: string };
}

async function processBenchEntry({
  entry,
  outDir,
  formats,
  defaultSeed,
}: ProcessBenchEntryOptions): Promise<ProcessBenchEntryResult> {
  try {
    const schemaRaw = await readFile(entry.schema, 'utf8');
    const schema = JSON.parse(schemaRaw);
    const report = await runEngineOnSchema({
      schema,
      schemaId: entry.schemaId ?? entry.id ?? basename(entry.schema),
      schemaPath: entry.schema,
      maxInstances: entry.maxInstances,
      seed: entry.seed ?? defaultSeed,
      planOptions: entry.planOptions as PlanOptions | undefined,
    });

    const reportJsonPath = await writeReportArtifacts(
      report,
      entry.id,
      outDir,
      formats
    );
    return {
      summary: buildBenchSchemaSummaryFromReport(
        entry,
        report,
        reportJsonPath,
        entry.schema
      ),
      meta: {
        toolName: report.meta.toolName,
        toolVersion: report.meta.toolVersion,
        engineVersion: report.meta.engineVersion,
      },
    };
  } catch (error) {
    return {
      summary: buildBenchSchemaSummaryFromError(entry, error),
      meta: {},
    };
  }
}

async function writeReportArtifacts(
  report: Report,
  entryId: string,
  outDir: string,
  formats: string[]
): Promise<string> {
  const baseName = `${entryId}.report`;
  const jsonPath = join(outDir, `${baseName}.json`);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (formats.includes('markdown')) {
    await writeFile(
      join(outDir, `${baseName}.md`),
      `${renderMarkdownReport(report)}\n`,
      'utf8'
    );
  }
  if (formats.includes('html')) {
    await writeFile(
      join(outDir, `${baseName}.html`),
      renderHtmlReport(report),
      'utf8'
    );
  }

  return jsonPath;
}

export async function loadBenchConfig(
  configPath: string
): Promise<BenchConfig> {
  const absolute = resolve(configPath);
  const raw = await readFile(absolute, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('Bench config must be an array.');
  }
  const baseDir = dirname(absolute);
  return parsed.map((entry, index) =>
    normalizeBenchEntry(entry, index, baseDir)
  );
}

function normalizeBenchEntry(
  entry: unknown,
  index: number,
  baseDir: string
): BenchConfigEntry {
  if (!entry || typeof entry !== 'object') {
    throw new Error(`Bench entry at index ${index} is invalid.`);
  }
  const { id, schema, schemaId, maxInstances, seed, planOptions } =
    entry as Record<string, unknown>;
  if (typeof id !== 'string' || !id.trim()) {
    throw new Error(`Bench entry at index ${index} is missing a valid id.`);
  }
  if (typeof schema !== 'string' || !schema.trim()) {
    throw new Error(`Bench entry "${id}" is missing a schema path.`);
  }
  return {
    id,
    schema: resolve(baseDir, schema),
    schemaId: typeof schemaId === 'string' ? schemaId : undefined,
    maxInstances: typeof maxInstances === 'number' ? maxInstances : undefined,
    seed: typeof seed === 'number' ? seed : undefined,
    planOptions,
  };
}

const RUN_INFO_CODES = new Set<string>(['RESOLVER_STRATEGIES_APPLIED']);

function computeBenchLevelFromReport(report: Report): BenchLevel {
  const diag = report.summary.diagnosticsCount;
  const total = report.summary.totalInstances;
  const invalidRatio = total > 0 ? report.summary.invalid / total : 0;
  if (diag.composeFatal > 0 || diag.validateErrors > 0 || invalidRatio > 0.5) {
    return 'blocked';
  }

  const hasMeaningfulRunDiag = hasNonInformationalRunDiagnostics(report);

  if (
    diag.composeWarn > 0 ||
    hasMeaningfulRunDiag ||
    report.summary.invalid > 0
  ) {
    return 'limited';
  }
  return 'ok';
}

function hasNonInformationalRunDiagnostics(report: Report): boolean {
  const runDiags = report.compose?.result?.diag?.run;
  if (!runDiags || runDiags.length === 0) {
    return false;
  }
  return runDiags.some((diag) => !RUN_INFO_CODES.has(diag.code));
}

function buildBenchSchemaSummaryFromReport(
  entry: BenchConfigEntry,
  report: Report,
  reportPath: string,
  schemaPath: string
): BenchSchemaSummary {
  return {
    id: entry.id,
    schemaId: report.schemaId,
    schemaPath,
    reportPath,
    summary: report.summary,
    level: computeBenchLevelFromReport(report),
  };
}

function buildBenchSchemaSummaryFromError(
  entry: BenchConfigEntry,
  error: unknown
): BenchSchemaSummary {
  return {
    id: entry.id,
    schemaId: entry.schemaId ?? entry.id ?? basename(entry.schema),
    schemaPath: entry.schema,
    reportPath: '',
    summary: createEmptyReportSummary(),
    level: 'blocked',
    error: error instanceof Error ? error.message : String(error),
  };
}

function aggregateTotals(summaries: BenchSchemaSummary[]): BenchTotals {
  return summaries.reduce<BenchTotals>(
    (acc, summary) => {
      acc.schemas += 1;
      acc.instances += summary.summary.totalInstances;
      acc.composeFatal += summary.summary.diagnosticsCount.composeFatal;
      acc.composeWarn += summary.summary.diagnosticsCount.composeWarn;
      acc.composeRunLevel += summary.summary.diagnosticsCount.composeRunLevel;
      acc.validateErrors += summary.summary.diagnosticsCount.validateErrors;
      acc.invalidInstances += summary.summary.invalid;
      return acc;
    },
    {
      schemas: 0,
      instances: 0,
      composeFatal: 0,
      composeWarn: 0,
      composeRunLevel: 0,
      validateErrors: 0,
      invalidInstances: 0,
    }
  );
}

function normalizeFormats(formats: string[]): string[] {
  const lower = Array.from(
    new Set(formats.map((value) => value.trim().toLowerCase()).filter(Boolean))
  );
  return lower.includes('json') ? lower : ['json', ...lower];
}

function createEmptyReportSummary(): ReportSummary {
  return {
    totalInstances: 0,
    validUnchanged: 0,
    validRepaired: 0,
    invalid: 0,
    diagnosticsCount: {
      normalizeNotes: 0,
      composeFatal: 0,
      composeWarn: 0,
      composeUnsatHints: 0,
      composeRunLevel: 0,
      repairBudgetExhausted: 0,
      validateErrors: 0,
    },
  };
}
