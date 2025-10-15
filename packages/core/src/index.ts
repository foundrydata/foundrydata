// @foundrydata/core entry point

export { Generator } from './generator';
export * from './parser';
export * from './types';
export * from './registry';
export * from './generator/formats';
export * from './validator';
export {
  generateFromCompose,
  type GeneratorStageOutput,
  type FoundryGeneratorOptions,
} from './generator/foundry-generator';
export * from '@foundrydata/shared';
export {
  ErrorCode,
  type Severity,
  getExitCode,
  getHttpStatus,
} from './errors/codes';
export {
  ErrorPresenter,
  type CLIErrorView,
  type APIErrorView,
  type ProductionView,
} from './errors/presenter';

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
} from './errors/limitations-deprecated';

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
} from './errors/suggestions';

// Initialize built-in formats to avoid circular dependencies
import {
  defaultFormatRegistry,
  initializeBuiltInFormats,
} from './registry/format-registry';
import {
  UUIDGenerator,
  EmailGenerator,
  DateGenerator,
  DateTimeGenerator,
} from './generator/formats';

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
} from './util/ajv-source';
export { createPlanningAjv, clonePlanningAjvWith } from './util/ajv-planning';
export { checkAjvStartupParity, AjvFlagsMismatchError } from './util/ajv-gate';

// Diagnostics & metrics helpers (Task 6)
export {
  MetricsCollector,
  METRIC_PHASES,
  type MetricPhase,
  type MetricsVerbosity,
  type MetricsSnapshot,
  type BranchCoverageOneOfEntry,
} from './util/metrics';
export {
  DIAGNOSTIC_CODES,
  type DiagnosticCode,
  type KnownDiagnosticCode,
  getDiagnosticPhase,
  getAllowedDiagnosticPhases,
  isGeneratorOnlyCode,
  isComposeOnlyCode,
  isKnownDiagnosticCode,
} from './diag/codes';
export {
  assertDiagnosticEnvelope,
  type DiagnosticEnvelope,
} from './diag/validate';
export {
  compose,
  type ComposeOptions,
  type ComposeResult,
  type CoverageEntry,
  type CoverageIndex,
} from './transform/composition-engine';
export { executePipeline } from './pipeline/orchestrator';
export {
  PipelineStageError,
  type PipelineOptions,
  type PipelineArtifacts,
  type PipelineResult,
  type PipelineStageName,
  type PipelineStageStatus,
  type PipelineStageOverrides,
} from './pipeline/types';
