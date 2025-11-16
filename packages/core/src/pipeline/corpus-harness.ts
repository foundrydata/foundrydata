import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';

import { executePipeline } from './orchestrator.js';
import type { PipelineOptions, PipelineResult } from './types.js';
import type { PlanOptions } from '../types/options.js';
import { DIAGNOSTIC_CODES, type DiagnosticCode } from '../diag/codes.js';
import type { DiagnosticEnvelope } from '../diag/validate.js';
import {
  collectAllDiagnosticsFromPipeline,
  isUnsatOrFailFastCode,
} from './diagnostic-collector.js';

export type CorpusMode = 'strict' | 'lax';

export interface CorpusSchemaConfig {
  id: string;
  schema: unknown;
  schemaPath?: string;
}

export interface CorpusSchemaMetrics {
  normalizeMs?: number;
  composeMs?: number;
  generateMs?: number;
  repairMs?: number;
  validateMs?: number;
  validationsPerRow?: number;
  repairPassesPerRow?: number;
}

export interface CorpusSchemaCaps {
  regexCapped?: number;
  nameAutomatonCapped?: number;
  smtTimeouts?: number;
}

export interface CorpusSchemaResult {
  id: string;
  mode: CorpusMode;
  schemaPath?: string;
  instancesTried: number;
  instancesValid: number;
  unsat: boolean;
  failFast: boolean;
  diagnostics: DiagnosticEnvelope[];
  metrics?: CorpusSchemaMetrics;
  caps?: CorpusSchemaCaps;
}

export interface CorpusRunSummary {
  totalSchemas: number;
  schemasWithSuccess: number;
  totalInstancesTried: number;
  totalInstancesValid: number;
  unsatCount: number;
  failFastCount: number;
  caps: {
    regexCapped: number;
    nameAutomatonCapped: number;
    smtTimeouts: number;
  };
}

export interface CorpusRunReport {
  mode: CorpusMode;
  seed: number;
  instancesPerSchema: number;
  results: CorpusSchemaResult[];
  summary: CorpusRunSummary;
}

export interface CorpusRunOptions {
  schemas: CorpusSchemaConfig[];
  mode: CorpusMode;
  seed: number;
  instancesPerSchema: number;
  validateFormats?: boolean;
  planOptions?: Partial<PlanOptions>;
}

export interface CorpusRunFromDirOptions {
  corpusDir: string;
  mode: CorpusMode;
  seed: number;
  instancesPerSchema: number;
  validateFormats?: boolean;
  planOptions?: Partial<PlanOptions>;
  filePattern?: RegExp;
}

export async function runCorpusHarness(
  options: CorpusRunOptions
): Promise<CorpusRunReport> {
  const results: CorpusSchemaResult[] = [];

  for (const entry of options.schemas) {
    const result = await runSingleSchema(entry, options);
    results.push(result);
  }

  const summary = aggregateCorpusSummary(results);
  return {
    mode: options.mode,
    seed: options.seed,
    instancesPerSchema: options.instancesPerSchema,
    results,
    summary,
  };
}

export async function runCorpusHarnessFromDir(
  options: CorpusRunFromDirOptions
): Promise<CorpusRunReport> {
  const schemas = await discoverCorpusSchemasFromDir(options.corpusDir, {
    filePattern: options.filePattern,
  });
  return runCorpusHarness({
    schemas,
    mode: options.mode,
    seed: options.seed,
    instancesPerSchema: options.instancesPerSchema,
    validateFormats: options.validateFormats,
    planOptions: options.planOptions,
  });
}

export async function discoverCorpusSchemasFromDir(
  corpusDir: string,
  options: { filePattern?: RegExp } = {}
): Promise<CorpusSchemaConfig[]> {
  const root = resolve(corpusDir);
  const pattern = options.filePattern ?? /\.json$/i;
  const entries: CorpusSchemaConfig[] = [];

  await walkDir(root, async (filePath) => {
    if (!pattern.test(filePath)) return;
    const raw = await readFile(filePath, 'utf8');
    const schema = JSON.parse(raw) as unknown;
    const rel = relative(root, filePath).split('\\').join('/');
    const id = rel.replace(/\.json$/i, '');
    entries.push({
      id,
      schema,
      schemaPath: filePath,
    });
  });

  entries.sort((a, b) => a.id.localeCompare(b.id));
  return entries;
}

async function walkDir(
  dir: string,
  onFile: (filePath: string) => Promise<void>
): Promise<void> {
  const dirents = await readdir(dir, { withFileTypes: true });
  for (const dirent of dirents) {
    const fullPath = join(dir, dirent.name);
    if (dirent.isDirectory()) {
      await walkDir(fullPath, onFile);
    } else if (dirent.isFile()) {
      await onFile(fullPath);
    }
  }
}

async function runSingleSchema(
  config: CorpusSchemaConfig,
  options: CorpusRunOptions
): Promise<CorpusSchemaResult> {
  const pipelineOptions: PipelineOptions = {
    mode: options.mode,
    metrics: {
      enabled: true,
      verbosity: 'ci',
    },
    snapshotVerbosity: 'ci',
    generate: {
      count: options.instancesPerSchema,
      seed: options.seed,
      planOptions: options.planOptions,
    },
    validate: {
      validateFormats: options.validateFormats ?? false,
    },
  };

  const pipelineResult = await executePipeline(config.schema, pipelineOptions);

  return buildSchemaResult(config, options, pipelineResult);
}

function buildSchemaResult(
  config: CorpusSchemaConfig,
  options: CorpusRunOptions,
  pipelineResult: PipelineResult
): CorpusSchemaResult {
  const generatedItems = pipelineResult.artifacts.generated?.items ?? [];
  const repairedItems = pipelineResult.artifacts.repaired;
  const finalItems =
    Array.isArray(repairedItems) && repairedItems.length > 0
      ? repairedItems
      : generatedItems;

  const validation = pipelineResult.artifacts.validation;
  const skippedValidation = validation?.skippedValidation === true;
  const isCompleted =
    pipelineResult.status === 'completed' &&
    (skippedValidation || validation?.valid !== false);

  const instancesTried = generatedItems.length;
  const instancesValid =
    isCompleted && !skippedValidation ? finalItems.length : 0;

  const diagnostics = collectAllDiagnosticsFromPipeline(pipelineResult);
  const unsatDiagnostics = diagnostics.filter((diag) => isUnsatCode(diag.code));
  const failFastDiagnostics = diagnostics.filter(
    (diag) => isUnsatOrFailFastCode(diag.code) && !isUnsatCode(diag.code)
  );

  const caps = computeCaps(diagnostics);
  const metrics = extractMetrics(pipelineResult);

  return {
    id: config.id,
    mode: options.mode,
    schemaPath: config.schemaPath,
    instancesTried,
    instancesValid,
    unsat: unsatDiagnostics.length > 0,
    failFast: failFastDiagnostics.length > 0,
    diagnostics,
    metrics,
    caps,
  };
}

function extractMetrics(
  result: PipelineResult
): CorpusSchemaMetrics | undefined {
  const m = result.metrics;
  if (!m) {
    return undefined;
  }
  return {
    normalizeMs: m.normalizeMs,
    composeMs: m.composeMs,
    generateMs: m.generateMs,
    repairMs: m.repairMs,
    validateMs: m.validateMs,
    validationsPerRow: m.validationsPerRow,
    repairPassesPerRow: m.repairPassesPerRow,
  };
}

function computeCaps(diagnostics: DiagnosticEnvelope[]): CorpusSchemaCaps {
  return {
    regexCapped: countDiagnosticsWithCode(
      diagnostics,
      DIAGNOSTIC_CODES.REGEX_COMPLEXITY_CAPPED
    ),
    nameAutomatonCapped: countDiagnosticsWithCode(
      diagnostics,
      DIAGNOSTIC_CODES.NAME_AUTOMATON_COMPLEXITY_CAPPED
    ),
    smtTimeouts: countDiagnosticsWithCode(
      diagnostics,
      DIAGNOSTIC_CODES.SOLVER_TIMEOUT
    ),
  };
}

function countDiagnosticsWithCode(
  diagnostics: DiagnosticEnvelope[],
  code: DiagnosticCode
): number {
  return diagnostics.reduce(
    (acc, diag) => (diag.code === code ? acc + 1 : acc),
    0
  );
}

function isUnsatCode(code: DiagnosticCode): boolean {
  return typeof code === 'string' && code.startsWith('UNSAT_');
}

function aggregateCorpusSummary(
  results: CorpusSchemaResult[]
): CorpusRunSummary {
  return results.reduce<CorpusRunSummary>(
    (acc, entry) => {
      acc.totalSchemas += 1;
      acc.totalInstancesTried += entry.instancesTried;
      acc.totalInstancesValid += entry.instancesValid;
      if (entry.instancesValid > 0) {
        acc.schemasWithSuccess += 1;
      }
      if (entry.unsat) {
        acc.unsatCount += 1;
      }
      if (entry.failFast) {
        acc.failFastCount += 1;
      }
      acc.caps.regexCapped += entry.caps?.regexCapped ?? 0;
      acc.caps.nameAutomatonCapped += entry.caps?.nameAutomatonCapped ?? 0;
      acc.caps.smtTimeouts += entry.caps?.smtTimeouts ?? 0;
      return acc;
    },
    {
      totalSchemas: 0,
      schemasWithSuccess: 0,
      totalInstancesTried: 0,
      totalInstancesValid: 0,
      unsatCount: 0,
      failFastCount: 0,
      caps: {
        regexCapped: 0,
        nameAutomatonCapped: 0,
        smtTimeouts: 0,
      },
    }
  );
}
