// @foundrydata/core entry point

export * from './types/index.js';

// Normalizer (Task 7)
export {
  normalize,
  type NormalizerNote,
  type NormalizeOptions,
  type NormalizeResult,
} from './transform/schema-normalizer.js';

// Generator (Task 9)
export {
  generateFromCompose,
  type GeneratorStageOutput,
  type GeneratorDiagnostic,
  type FoundryGeneratorOptions,
} from './generator/foundry-generator.js';

// Errors
export {
  ErrorCode,
  type Severity,
  getExitCode,
  getHttpStatus,
} from './errors/codes.js';
export {
  ErrorPresenter,
  type CLIErrorView,
  type APIErrorView,
  type ProductionView,
} from './errors/presenter.js';

// AJV utilities (Task 2)
export {
  createSourceAjv,
  createRepairOnlyValidatorAjv,
  getAjvClassLabel,
  extractAjvFlags,
} from './util/ajv-source.js';
export {
  createPlanningAjv,
  clonePlanningAjvWith,
} from './util/ajv-planning.js';
export {
  checkAjvStartupParity,
  AjvFlagsMismatchError,
} from './util/ajv-gate.js';

// Diagnostics & metrics helpers (Task 6)
export {
  MetricsCollector,
  METRIC_PHASES,
  type MetricPhase,
  type MetricsVerbosity,
  type MetricsSnapshot,
  type BranchCoverageOneOfEntry,
} from './util/metrics.js';
export {
  DIAGNOSTIC_CODES,
  type DiagnosticCode,
  type KnownDiagnosticCode,
  getDiagnosticPhase,
  getAllowedDiagnosticPhases,
  isGeneratorOnlyCode,
  isComposeOnlyCode,
  isKnownDiagnosticCode,
} from './diag/codes.js';
export {
  assertDiagnosticEnvelope,
  type DiagnosticEnvelope,
} from './diag/validate.js';
export {
  compose,
  computeSelectorMemoKey,
  type ComposeOptions,
  type ComposeResult,
  type ComposeDiagnostics,
  type BranchDecisionRecord,
  type NodeDiagnostics,
  type CoverageEntry,
  type CoverageIndex,
} from './transform/composition-engine.js';
export type { ContainsNeed } from './transform/arrays/contains-bag.js';
export { executePipeline } from './pipeline/orchestrator.js';
export {
  PipelineStageError,
  type PipelineOptions,
  type PipelineArtifacts,
  type PipelineResult,
  type PipelineStageName,
  type PipelineStageStatus,
  type PipelineStageOverrides,
} from './pipeline/types.js';

// Options system (Task 3, used by CLI and API)
export {
  resolveOptions,
  DEFAULT_OPTIONS,
  type PlanOptions,
  type ResolvedOptions,
  type RationalOptions,
  type EncodingOptions,
  type TrialsOptions,
  type GuardsOptions,
  type CacheOptions,
  type ComplexityOptions,
  type FailFastOptions,
  type ConditionalsOptions,
  type PatternWitnessOptions,
} from './types/options.js';

// Repair Engine (Task 10)
export {
  RepairEngine,
  formatEpsilon,
  nudgeDetailsForExclusive,
  chooseClosedEnumRenameCandidate,
  repairItemsAjvDriven,
  type RepairAction,
  type RepairItemsResult,
  type RenamePreflightOptions,
  type RenamePreflightResult,
  type AjvErr,
  type RepairCtx,
} from './repair/repair-engine.js';
