import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type {
  CoverageEntry,
  PipelineArtifacts,
  PipelineResult,
} from '@foundrydata/core';

import {
  AjvErr,
  ComposeResult,
  CoverageEntrySnapshot,
  DiagnosticEnvelope,
  InstanceResult,
  MetricsSnapshot,
  NormalizeResult,
  RepairAction,
  Report,
  buildReportSummary,
} from '../model/report.js';
import type { EngineRunOptions } from './types.js';

const require = createRequire(import.meta.url);
const reporterPkg = require('../../package.json') as {
  name?: string;
  version?: string;
};
const corePkg = require('@foundrydata/core/package.json') as {
  version?: string;
};

const TOOL_NAME =
  typeof reporterPkg.name === 'string'
    ? reporterPkg.name
    : 'json-schema-reporter';
const TOOL_VERSION =
  typeof reporterPkg.version === 'string' ? reporterPkg.version : '0.0.0';
const ENGINE_VERSION =
  typeof corePkg.version === 'string' ? corePkg.version : undefined;

export function buildReportFromPipeline(
  options: EngineRunOptions,
  pipelineResult: PipelineResult
): Report {
  const normalizeResult = pipelineResult.artifacts.canonical;
  const composeResult = pipelineResult.artifacts.effective;
  const coverageIndexSnapshot = snapshotCoverageIndex(composeResult);
  const generatorDiagnostics = collectGeneratorDiagnostics(pipelineResult);
  const { reportActions, actionsByInstance } = mapRepairActions(
    pipelineResult.artifacts.repairActions
  );
  const finalItems = getFinalItems(pipelineResult);
  const instances = buildInstances(finalItems, actionsByInstance);
  const validationErrors = flattenAjvErrors(
    pipelineResult.artifacts.validation?.errors
  );
  const diagnosticsCount = buildDiagnosticsCount(
    normalizeResult,
    composeResult,
    validationErrors
  );
  const metrics = pipelineResult.metrics satisfies MetricsSnapshot;

  return {
    schemaId: options.schemaId,
    schemaPath: options.schemaPath,
    schemaHash: hashSchema(options.schema),
    planOptions: options.planOptions ?? {},
    meta: buildMeta(options, pipelineResult),
    normalize: normalizeResult ? { result: normalizeResult } : undefined,
    compose: composeResult
      ? {
          result: composeResult,
          coverageIndexSnapshot,
        }
      : undefined,
    generate: generatorDiagnostics.length
      ? { diagnostics: generatorDiagnostics }
      : undefined,
    repair: { actions: reportActions },
    validate: { errors: validationErrors ?? [] },
    instances,
    metrics,
    summary: buildReportSummary({ instances, diagnosticsCount, metrics }),
  } satisfies Report;
}

function buildMeta(
  options: EngineRunOptions,
  result: PipelineResult
): Report['meta'] {
  return {
    toolName: TOOL_NAME,
    toolVersion: TOOL_VERSION,
    engineVersion: ENGINE_VERSION,
    timestamp: new Date().toISOString(),
    seed: result.artifacts.generated?.seed ?? options.seed,
  };
}

function hashSchema(schema: unknown): string {
  const serialized = JSON.stringify(schema ?? null);
  return createHash('sha256').update(serialized).digest('hex');
}

function getFinalItems(result: PipelineResult): unknown[] {
  const generatedItems = result.artifacts.generated?.items ?? [];
  return result.artifacts.repaired ?? generatedItems;
}

function collectGeneratorDiagnostics(
  result: PipelineResult
): DiagnosticEnvelope[] {
  const diagnostics = result.artifacts.generated?.diagnostics ?? [];
  return diagnostics.map((diag) => ({
    code: diag.code,
    canonPath: diag.canonPath,
    details: diag.details,
  }));
}

function snapshotCoverageIndex(
  effective?: ComposeResult
): CoverageEntrySnapshot[] | undefined {
  if (!effective?.coverageIndex) {
    return undefined;
  }
  const entries: CoverageEntrySnapshot[] = [];
  for (const [canonPath, entry] of effective.coverageIndex.entries()) {
    const enumerated = entry.enumerate ? safeEnumerate(entry) : undefined;
    entries.push({
      canonPath: normalizeCanonPath(canonPath),
      enumeratedKeys: enumerated,
      provenance: entry.provenance,
      hasUniverse: enumerated ? 'finite' : 'unknown',
    });
  }
  return entries.length ? entries : undefined;
}

function safeEnumerate(entry: CoverageEntry): string[] | undefined {
  try {
    return entry.enumerate?.();
  } catch {
    return undefined;
  }
}

function normalizeCanonPath(path: string): string {
  if (!path || path === '') {
    return '#';
  }
  return path;
}

type ReportRepairAction = RepairAction;

function mapRepairActions(actions?: PipelineArtifacts['repairActions']): {
  reportActions: ReportRepairAction[];
  actionsByInstance: Map<number, ReportRepairAction[]>;
} {
  const reportActions: ReportRepairAction[] = [];
  const actionsByInstance = new Map<number, ReportRepairAction[]>();
  if (!Array.isArray(actions)) {
    return { reportActions, actionsByInstance };
  }
  for (const action of actions) {
    const mapped: ReportRepairAction = {
      keyword: action.action,
      canonPath: action.canonPath,
      origPath: action.origPath,
      details: action.details,
    };
    reportActions.push(mapped);
    const index = parseInstanceIndex(action.instancePath);
    if (index !== undefined) {
      const existing = actionsByInstance.get(index);
      if (existing) {
        existing.push(mapped);
      } else {
        actionsByInstance.set(index, [mapped]);
      }
    }
  }
  return { reportActions, actionsByInstance };
}

function parseInstanceIndex(instancePath?: string): number | undefined {
  if (!instancePath || instancePath.length === 0) {
    return undefined;
  }
  const segments = instancePath.split('/').filter(Boolean);
  if (segments.length === 0) {
    return undefined;
  }
  const candidate = Number.parseInt(segments[0] ?? '', 10);
  return Number.isNaN(candidate) ? undefined : candidate;
}

function flattenAjvErrors(raw?: unknown): AjvErr[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const flattened: AjvErr[] = [];
  for (const group of raw) {
    if (!Array.isArray(group)) {
      continue;
    }
    for (const err of group) {
      const normalized = normalizeAjvError(err);
      if (normalized) {
        flattened.push(normalized);
      }
    }
  }
  return flattened.length ? flattened : undefined;
}

function normalizeAjvError(err: unknown): AjvErr | undefined {
  if (!err || typeof err !== 'object') {
    return undefined;
  }
  const keyword = extractString(
    (err as { keyword?: unknown }).keyword,
    'unknown'
  );
  const instancePath = extractString(
    (err as { instancePath?: unknown }).instancePath
  );
  const schemaPath = extractString(
    (err as { schemaPath?: unknown }).schemaPath
  );
  const params = (err as { params?: Record<string, unknown> }).params ?? {};
  return { keyword, instancePath, schemaPath, params } satisfies AjvErr;
}

function extractString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function buildInstances(
  finalItems: unknown[],
  actionsByInstance: Map<number, ReportRepairAction[]>
): InstanceResult[] {
  return finalItems.map((data, index) => {
    const repairActions = actionsByInstance.get(index);
    return {
      index,
      data,
      outcome:
        repairActions && repairActions.length > 0
          ? 'valid-repaired'
          : 'valid-unchanged',
      repairActions,
    } satisfies InstanceResult;
  });
}

function buildDiagnosticsCount(
  normalizeResult: NormalizeResult | undefined,
  composeResult: ComposeResult | undefined,
  validationErrors: AjvErr[] | undefined
): Report['summary']['diagnosticsCount'] {
  const diag = composeResult?.diag;
  return {
    normalizeNotes: lengthOf(normalizeResult?.notes),
    composeFatal: lengthOf(diag?.fatal),
    composeWarn: lengthOf(diag?.warn),
    composeUnsatHints: lengthOf(diag?.unsatHints),
    composeRunLevel: lengthOf(diag?.run),
    repairBudgetExhausted: 0,
    validateErrors: lengthOf(validationErrors),
  };
}

function lengthOf(value?: { length: number } | null): number {
  return value?.length ?? 0;
}
