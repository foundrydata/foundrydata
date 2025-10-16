// @foundrydata/core entry point

export { Generator } from './generator/index.js';
export * from './parser/index.js';
export * from './types/index.js';
export * from './registry/index.js';
export * from './generator/formats/index.js';
export * from './validator/index.js';
export {
  generateFromCompose,
  type GeneratorStageOutput,
  type FoundryGeneratorOptions,
} from './generator/foundry-generator.js';
export * from '@foundrydata/shared';
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

// Limitations registry and helpers (Task 6)
export {
  LIMITATIONS_REGISTRY,
  type Limitation,
  type LimitationKey,
  CURRENT_VERSION,
  getLimitation,
  compareVersions,
  isSupported,
  enrichErrorWithLimitation,
} from './errors/limitations-deprecated.js';

// Suggestion system helpers (Task 7)
export {
  didYouMean,
  getAlternative,
  proposeSchemaFix,
  getWorkaround,
  calculateDistance,
  type Alternative,
  type SchemaFix,
  type Workaround,
} from './errors/suggestions.js';

// Initialize built-in formats to avoid circular dependencies
import {
  defaultFormatRegistry,
  initializeBuiltInFormats,
} from './registry/format-registry.js';
import {
  UUIDGenerator,
  EmailGenerator,
  DateGenerator,
  DateTimeGenerator,
} from './generator/formats/index.js';

// Set up lazy initialization for the default registry
defaultFormatRegistry.setInitializer(() => {
  initializeBuiltInFormats(defaultFormatRegistry, [
    new UUIDGenerator(),
    new EmailGenerator(),
    new DateGenerator(),
    new DateTimeGenerator(),
  ]);
});

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
  type ComposeOptions,
  type ComposeResult,
  type CoverageEntry,
  type CoverageIndex,
} from './transform/composition-engine.js';
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
  type RenamePreflightOptions,
  type RenamePreflightResult,
} from './repair/repair-engine.js';
