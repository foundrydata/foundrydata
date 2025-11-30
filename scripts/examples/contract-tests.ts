/* eslint-disable max-lines-per-function */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { PipelineOptions, PipelineResult } from '@foundrydata/core';
import { Generate, Validate } from '@foundrydata/core';

async function loadJsonFromCwd(schemaPath: string): Promise<unknown> {
  const abs = path.resolve(process.cwd(), schemaPath);
  const raw = await fs.readFile(abs, 'utf8');
  return JSON.parse(raw) as unknown;
}

export interface ContractTestsHarnessOptions {
  schemaPath?: string;
  count?: number;
  seed?: number;
  mode?: 'strict' | 'lax';
  coverageMode?: 'off' | 'measure' | 'guided';
  coverageDimensions?: string[];
  coverageMin?: number;
}

export interface ContractTestsExampleResult {
  items: unknown[];
  meta: {
    count: number;
    seed: number;
    schemaPath: string;
    mode: 'strict' | 'lax';
    coverageMode: 'off' | 'measure' | 'guided';
  };
  coverage?: {
    overall: number;
    byDimension: Record<string, number>;
    coverageStatus: string;
  };
}

export async function runContractTestsExample(
  options: ContractTestsHarnessOptions = {}
): Promise<ContractTestsExampleResult> {
  const schemaPath = options.schemaPath ?? 'examples/payment.json';
  const schema = await loadJsonFromCwd(schemaPath);

  const count = options.count ?? 10;
  const seed = options.seed ?? 123;
  const mode: 'strict' | 'lax' = options.mode ?? 'strict';
  const coverageMode: 'off' | 'measure' | 'guided' =
    options.coverageMode ?? 'off';

  const coverageOptions = buildCoverageOptions(options);

  const stream = Generate(count, seed, schema as object, {
    mode,
    validateFormats: true,
    coverage: coverageOptions,
  });

  const pipelineResult = await stream.result;
  ensurePipelineCompleted(pipelineResult);

  const items = extractItemsFromResult(pipelineResult);
  const coverageReport = pipelineResult.artifacts.coverageReport;

  const validCount = validateAllItems(items, schema);

  logContractSummary(items, validCount, {
    seed,
    mode,
    coverageMode,
  });

  const coverageSummary = summarizeCoverage(coverageReport);

  return {
    items,
    meta: {
      count,
      seed,
      schemaPath,
      mode,
      coverageMode,
    },
    coverage: coverageSummary,
  };
}

const entryHref =
  typeof process.argv[1] === 'string'
    ? pathToFileURL(process.argv[1]).href
    : '';

function buildCoverageOptions(
  options: ContractTestsHarnessOptions
): PipelineOptions['coverage'] | undefined {
  const coverageMode: 'off' | 'measure' | 'guided' =
    options.coverageMode ?? 'off';
  if (coverageMode === 'off') return undefined;

  const dimensions = options.coverageDimensions ?? [
    'structure',
    'branches',
    'enum',
  ];

  return {
    mode: coverageMode,
    dimensionsEnabled:
      dimensions as PipelineOptions['coverage']['dimensionsEnabled'],
    excludeUnreachable: true,
    minCoverage: options.coverageMin,
  };
}

function ensurePipelineCompleted(result: PipelineResult): void {
  if (result.status === 'completed') return;
  const stageError = result.errors[0];
  if (stageError) throw stageError;
  throw new Error('Contract tests pipeline did not complete');
}

function extractItemsFromResult(result: PipelineResult): unknown[] {
  const generatedStage = result.stages.generate.output;
  const repairedItems = result.artifacts.repaired;
  if (Array.isArray(repairedItems)) {
    return repairedItems as unknown[];
  }
  return (generatedStage?.items ?? []) as unknown[];
}

function validateAllItems(items: unknown[], schema: unknown): number {
  let validCount = 0;
  for (const item of items) {
    const res = Validate(item, schema);
    if (!res.valid) {
      throw new Error(
        `Generated payment did not validate: ${JSON.stringify(res.ajvErrors)}`
      );
    }
    validCount += 1;
  }
  return validCount;
}

function logContractSummary(
  items: unknown[],
  validCount: number,
  meta: { seed: number; mode: 'strict' | 'lax'; coverageMode: string }
): void {
  // eslint-disable-next-line no-console
  console.log(
    `[contract-tests] generated ${items.length} items (valid=${validCount}, seed=${meta.seed}, mode=${meta.mode}, coverage=${meta.coverageMode})`
  );
  if (items[0]) {
    // eslint-disable-next-line no-console
    console.log(
      '[contract-tests] sample item:',
      JSON.stringify(items[0], null, 2)
    );
  }
}

function summarizeCoverage(
  coverageReport: PipelineResult['artifacts']['coverageReport']
):
  | {
      overall: number;
      byDimension: Record<string, number>;
      coverageStatus: string;
    }
  | undefined {
  if (!coverageReport) return undefined;
  const overall = coverageReport.metrics.overall;
  const byDimension = coverageReport.metrics.byDimension;
  const coverageStatus = coverageReport.metrics.coverageStatus;

  // eslint-disable-next-line no-console
  console.log(
    '[contract-tests] coverage summary:',
    JSON.stringify(
      {
        overall,
        byDimension,
        coverageStatus,
      },
      null,
      2
    )
  );

  return {
    overall,
    byDimension,
    coverageStatus,
  };
}

function parseCliArgs(argv: string[]): ContractTestsHarnessOptions {
  const opts: ContractTestsHarnessOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;
    i = handleCliArg(opts, argv, i);
  }
  return opts;
}

// eslint-disable-next-line complexity
function handleCliArg(
  opts: ContractTestsHarnessOptions,
  argv: string[],
  index: number
): number {
  const arg = argv[index];
  const next = argv[index + 1];

  switch (arg) {
    case '--schema':
    case '--schema-path':
      if (next !== undefined) {
        opts.schemaPath = next;
      }
      return index + 1;
    case '--n':
    case '--count':
      if (next !== undefined) {
        opts.count = Number(next);
      }
      return index + 1;
    case '--seed':
      if (next !== undefined) {
        opts.seed = Number(next);
      }
      return index + 1;
    case '--mode':
      if (next === 'strict' || next === 'lax') {
        opts.mode = next;
      }
      return index + 1;
    case '--coverage':
      if (next === 'off' || next === 'measure' || next === 'guided') {
        opts.coverageMode = next;
      }
      return index + 1;
    case '--coverage-dimensions':
      if (next !== undefined) {
        opts.coverageDimensions = next
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
      return index + 1;
    case '--coverage-min':
      if (next !== undefined) {
        opts.coverageMin = Number(next);
      }
      return index + 1;
    default:
      return index;
  }
}

if (import.meta.url === entryHref) {
  const cliOptions = parseCliArgs(process.argv.slice(2));
  runContractTestsExample(cliOptions).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
