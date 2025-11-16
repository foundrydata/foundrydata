/**
 * Data model definitions for the reporting layer. These types mirror the
 * normative structures referenced in the SPEC and intentionally avoid changing
 * shapes that will eventually be provided by the core engine implementation.
 */
import type {
  PlanOptions as CorePlanOptions,
  NormalizeResult as CoreNormalizeResult,
  ComposeResult as CoreComposeResult,
  AjvErr as CoreAjvErr,
  DiagnosticEnvelope as CoreDiagnosticEnvelope,
  MetricsSnapshot as CoreMetricsSnapshot,
} from '@foundrydata/core';

export type PlanOptions = CorePlanOptions;
export type NormalizeResult = CoreNormalizeResult;
export type ComposeResult = CoreComposeResult;
export type AjvErr = CoreAjvErr;

/** Envelope normative pour Normalize / Compose / Repair / Validate diagnostics. */
export type DiagnosticEnvelope = CoreDiagnosticEnvelope;

/** Snapshot de diag.metrics (§15). */
export type MetricsSnapshot = CoreMetricsSnapshot;

export type CoverageProvenance =
  | 'properties'
  | 'patternProperties'
  | 'propertyNamesSynthetic';

/** Snapshot sérialisable d’une entrée CoverageIndex. */
export interface CoverageEntrySnapshot {
  canonPath: string;
  enumeratedKeys?: string[];
  provenance?: CoverageProvenance[];
  hasUniverse?: 'all' | 'finite' | 'unknown';
}

export type ValidationOutcome =
  | 'valid-unchanged'
  | 'valid-repaired'
  | 'invalid';

/** Action de repair, alignée sur la spec (§23 Repair). */
export interface RepairAction {
  keyword: string;
  canonPath: string;
  origPath?: string;
  details?: unknown;
}

/** Résultat par instance générée/testée. */
export interface InstanceResult {
  index: number;
  data: unknown;
  outcome: ValidationOutcome;
  validationErrors?: AjvErr[];
  repairActions?: RepairAction[];
  diagnostics?: DiagnosticEnvelope[];
  notes?: string;
}

export interface ReportMeta {
  toolName: string;
  toolVersion: string;
  engineVersion?: string;
  timestamp: string;
  seed?: number;
  labels?: string[];
}

export interface ReportSummary {
  totalInstances: number;
  validUnchanged: number;
  validRepaired: number;
  invalid: number;
  timings?: {
    normalizeMs: number;
    composeMs: number;
    generateMs: number;
    repairMs: number;
    validateMs: number;
    compileMs?: number;
  };
  diagnosticsCount: {
    normalizeNotes: number;
    composeFatal: number;
    composeWarn: number;
    composeUnsatHints: number;
    composeRunLevel: number;
    repairBudgetExhausted: number;
    validateErrors: number;
  };
}

/**
 * Public, stable representation of a JSON Schema engine run.
 * Consumers may rely on this shape across reporter releases unless otherwise documented.
 */
export interface Report {
  /** Logical identifier of the schema under test (path, URL, or friendly name). */
  schemaId: string;
  /** Optional filesystem path of the schema (best-effort, useful for diagnostics). */
  schemaPath?: string;
  /** Hash of the raw schema contents (sha256) for change detection. */
  schemaHash?: string;
  /** Effective plan options used for the run (empty object when unspecified). */
  planOptions?: PlanOptions;
  /** Metadata about the tool/engine that produced this report. */
  meta: ReportMeta;
  /** @internal Raw Normalize artifacts emitted by the core engine (§7). */
  normalize?: { result?: NormalizeResult };
  /** @internal Compose artifacts. Consumers should prefer `coverageIndexSnapshot`. */
  compose?: {
    result?: ComposeResult;
    coverageIndexSnapshot?: CoverageEntrySnapshot[];
  };
  /** @internal Generator diagnostics captured during Phase 3. */
  generate?: {
    diagnostics?: DiagnosticEnvelope[];
  };
  /** Repair actions applied to the generated instances. */
  repair?: {
    actions?: RepairAction[];
    /** @internal Additional repair diagnostics (subject to change). */
    diag?: { budgetExhausted?: boolean };
  };
  /** Final AJV errors when validating the repaired instances against the original schema. */
  validate?: {
    errors?: AjvErr[];
  };
  /** Concrete instances produced/validated by the run. */
  instances: InstanceResult[];
  /** Summary metrics copied from `diag.metrics` (§15). */
  metrics?: MetricsSnapshot;
  /** Aggregated counts (outcomes, diagnostics, timings). */
  summary: ReportSummary;
}

/** Outcome counters derived from the instance list. */
export function computeInstanceOutcomeSummary(
  instances: InstanceResult[]
): Pick<
  ReportSummary,
  'totalInstances' | 'validUnchanged' | 'validRepaired' | 'invalid'
> {
  let validUnchanged = 0;
  let validRepaired = 0;
  let invalid = 0;

  for (const instance of instances) {
    if (instance.outcome === 'valid-unchanged') {
      validUnchanged += 1;
    } else if (instance.outcome === 'valid-repaired') {
      validRepaired += 1;
    } else {
      invalid += 1;
    }
  }

  return {
    totalInstances: instances.length,
    validUnchanged,
    validRepaired,
    invalid,
  };
}

/** Build the summary block given diagnostics counts and metrics. */
export function buildReportSummary(params: {
  instances: InstanceResult[];
  diagnosticsCount: ReportSummary['diagnosticsCount'];
  metrics?: MetricsSnapshot;
}): ReportSummary {
  const outcomeCounts = computeInstanceOutcomeSummary(params.instances);
  const timings = params.metrics
    ? {
        normalizeMs: params.metrics.normalizeMs,
        composeMs: params.metrics.composeMs,
        generateMs: params.metrics.generateMs,
        repairMs: params.metrics.repairMs,
        validateMs: params.metrics.validateMs,
        compileMs: params.metrics.compileMs,
      }
    : undefined;

  return {
    ...outcomeCounts,
    timings,
    diagnosticsCount: params.diagnosticsCount,
  };
}
