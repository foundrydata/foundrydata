/* eslint-disable max-lines */
/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
import {
  normalize,
  type NormalizeResult,
} from '../transform/schema-normalizer.js';
import {
  compose,
  type ComposeOptions,
  type ComposeInput,
} from '../transform/composition-engine.js';
import { createPlanningAjv } from '../util/ajv-planning.js';
import { createSourceAjv, extractAjvFlags } from '../util/ajv-source.js';
import { checkAjvStartupParity } from '../util/ajv-gate.js';
import { MetricsCollector, type MetricPhase } from '../util/metrics.js';
import { resolveOptions } from '../types/options.js';
import type { ValidateFunction } from 'ajv';
import {
  generateFromCompose,
  type GeneratorStageOutput,
  type FoundryGeneratorOptions,
} from '../generator/foundry-generator.js';
import {
  PipelineStageError,
  type PipelineStageName,
  type PipelineStageOverrides,
  type PipelineOptions,
  type PipelineResult,
  type PipelineStages,
  type PipelineStatus,
  type PipelineArtifacts,
  type ValidateStageResult,
} from './types.js';
import { repairItemsAjvDriven } from '../repair/repair-engine.js';
import {
  assertDiagnosticEnvelope,
  assertDiagnosticsForPhase,
  type DiagnosticEnvelope,
} from '../diag/validate.js';
import { DIAGNOSTIC_CODES, DIAGNOSTIC_PHASES } from '../diag/codes.js';
import { AjvFlagsMismatchError } from '../util/ajv-gate.js';

const STAGE_SEQUENCE: PipelineStageName[] = [
  'normalize',
  'compose',
  'generate',
  'repair',
  'validate',
];

const METRIC_PHASE_BY_STAGE: Record<PipelineStageName, MetricPhase> = {
  normalize: 'NORMALIZE',
  compose: 'COMPOSE',
  generate: 'GENERATE',
  repair: 'REPAIR',
  validate: 'VALIDATE',
};

type NormalizeRunner = (
  schema: unknown,
  options?: PipelineOptions['normalize']
) => NormalizeResult;

type ComposeRunner = (
  input: ComposeInput,
  options?: PipelineOptions['compose']
) => ReturnType<typeof compose>;

interface StageRunners {
  normalize: NormalizeRunner;
  compose: ComposeRunner;
  generate: (
    effective: ReturnType<typeof compose>,
    options?: PipelineOptions['generate']
  ) => Promise<GeneratorStageOutput> | GeneratorStageOutput;
  repair: (
    items: unknown[],
    args: { schema: unknown; effective: ReturnType<typeof compose> },
    options?: PipelineOptions['repair']
  ) =>
    | Promise<
        unknown[] | { items: unknown[]; diagnostics?: DiagnosticEnvelope[] }
      >
    | (unknown[] | { items: unknown[]; diagnostics?: DiagnosticEnvelope[] });
  validate: (
    items: unknown[],
    schema: unknown,
    options?: PipelineOptions['validate']
  ) => Promise<ValidateStageResult> | ValidateStageResult;
}

class ExternalRefValidationError extends Error {
  public readonly diagnostic: DiagnosticEnvelope;

  constructor(diagnostic: DiagnosticEnvelope) {
    super(DIAGNOSTIC_CODES.EXTERNAL_REF_UNRESOLVED);
    this.name = 'ExternalRefValidationError';
    this.diagnostic = diagnostic;
  }
}

function createInitialStages(): PipelineStages {
  return {
    normalize: { status: 'pending' },
    compose: { status: 'pending' },
    generate: { status: 'pending' },
    repair: { status: 'pending' },
    validate: { status: 'pending' },
  };
}

function toPipelineStageError(
  stage: PipelineStageName,
  throwable: unknown
): PipelineStageError {
  if (throwable instanceof PipelineStageError) {
    return throwable;
  }
  if (throwable instanceof Error) {
    return new PipelineStageError(stage, throwable.message, throwable);
  }
  return new PipelineStageError(stage, String(throwable));
}

function markRemainingStagesAsSkipped(
  stages: PipelineStages,
  failedStage: PipelineStageName
): void {
  const failedIndex = STAGE_SEQUENCE.indexOf(failedStage);
  if (failedIndex === -1) return;
  for (let idx = failedIndex + 1; idx < STAGE_SEQUENCE.length; idx += 1) {
    const stageName = STAGE_SEQUENCE[idx] as keyof PipelineStages;
    const stage = stages[stageName];
    if (stage.status === 'pending') {
      stage.status = 'skipped';
    }
  }
}

export async function executePipeline(
  schema: unknown,
  options: PipelineOptions = {},
  overrides: PipelineStageOverrides = {}
): Promise<PipelineResult> {
  const metrics =
    options.collector ?? new MetricsCollector(options.metrics ?? {});
  const runners: StageRunners = {
    normalize: overrides.normalize ?? normalize,
    compose: overrides.compose ?? compose,
    generate:
      overrides.generate ?? createDefaultGenerate(metrics, schema, options),
    repair: overrides.repair ?? createDefaultRepair(options),
    validate: overrides.validate ?? createDefaultValidate(options),
  };

  const stages = createInitialStages();
  const timeline: PipelineStageName[] = [];
  const errors: PipelineStageError[] = [];
  const artifacts: PipelineArtifacts = {};
  let status: PipelineStatus = 'completed';

  // Normalize stage
  let normalizeResult: NormalizeResult | undefined;
  metrics.begin(METRIC_PHASE_BY_STAGE.normalize);
  try {
    normalizeResult = runners.normalize(schema, options.normalize);
    stages.normalize = {
      status: 'completed',
      output: normalizeResult,
    };
    artifacts.canonical = normalizeResult;

    // Runtime self-check: diagnostics emitted during normalize must conform to phase rules
    const normalizeDiagnostics: DiagnosticEnvelope[] = (
      normalizeResult?.notes ?? []
    ).map((n) => ({
      code: n.code,
      canonPath: n.canonPath,
      details: n.details,
    }));
    if (normalizeDiagnostics.length > 0) {
      assertDiagnosticsForPhase(
        DIAGNOSTIC_PHASES.NORMALIZE,
        normalizeDiagnostics
      );
      for (const env of normalizeDiagnostics) {
        assertDiagnosticEnvelope(env);
      }
    }
  } catch (error) {
    const stageError = toPipelineStageError('normalize', error);
    stages.normalize = {
      status: 'failed',
      error: stageError,
    };
    errors.push(stageError);
    status = 'failed';
  } finally {
    metrics.end(METRIC_PHASE_BY_STAGE.normalize);
    timeline.push('normalize');
  }

  if (status === 'failed') {
    markRemainingStagesAsSkipped(stages, 'normalize');
    return {
      status,
      schema,
      stages,
      metrics: metrics.snapshotMetrics({
        verbosity: options.snapshotVerbosity,
      }),
      timeline,
      errors,
      artifacts,
    };
  }

  // Compose stage (requires canonical schema from normalize phase)
  metrics.begin(METRIC_PHASE_BY_STAGE.compose);
  try {
    const composeInput: ComposeInput =
      normalizeResult ??
      ({
        schema,
        ptrMap: new Map<string, string>(),
        revPtrMap: new Map<string, string[]>(),
        notes: [],
      } satisfies ComposeInput);
    let composeOptions: ComposeOptions | undefined =
      options.compose !== undefined ? { ...options.compose } : undefined;
    if (options.mode !== undefined) {
      if (!composeOptions) {
        composeOptions = { mode: options.mode };
      } else if (composeOptions.mode === undefined) {
        composeOptions.mode = options.mode;
      }
    }
    // Build planning AJV metadata for memoization keys (SPEC §14)
    const planOptions = options.generate?.planOptions;
    const resolved = resolveOptions(planOptions);
    const shouldAlignMoP =
      resolved.rational.fallback === 'decimal' ||
      resolved.rational.fallback === 'float';
    const expectedMoP = shouldAlignMoP
      ? resolved.rational.decimalPrecision
      : undefined;
    const planningForCompose = createPlanningAjv(
      {
        validateFormats: Boolean(options.validate?.validateFormats),
        discriminator: Boolean(options.validate?.discriminator),
        multipleOfPrecision: expectedMoP,
      },
      planOptions
    );
    const ajvFlags = extractAjvFlags(planningForCompose) as unknown as Record<
      string,
      unknown
    >;
    const ajvMajor = Number.parseInt(
      String(
        (planningForCompose as unknown as { version?: string }).version ?? '0'
      ).split('.')[0] ?? '0',
      10
    );
    const ajvClass =
      (
        planningForCompose as unknown as {
          __fd_ajvClass?: string;
        }
      ).__fd_ajvClass ?? 'Ajv2020';
    composeOptions = {
      ...composeOptions,
      planOptions,
      memoizer: {
        ajvMajor: Number.isFinite(ajvMajor) ? ajvMajor : 0,
        ajvClass,
        ajvFlags,
      },
    };
    const composeResult = runners.compose(composeInput, composeOptions);
    artifacts.effective = composeResult;

    const fatalDiagnostics = composeResult.diag?.fatal ?? [];
    if (fatalDiagnostics.length > 0) {
      const fatalError = new PipelineStageError(
        'compose',
        'COMPOSE_FATAL_DIAGNOSTICS',
        { fatalDiagnostics }
      );
      stages.compose = {
        status: 'failed',
        output: composeResult,
        error: fatalError,
      };
      errors.push(fatalError);
      status = 'failed';
    } else {
      stages.compose = {
        status: 'completed',
        output: composeResult,
      };
    }

    // Runtime self-check: diagnostics emitted during compose must conform to phase rules
    const composeDiagnostics: DiagnosticEnvelope[] = [
      ...(composeResult.diag?.fatal ?? []),
      ...(composeResult.diag?.warn ?? []),
    ];
    if (composeDiagnostics.length > 0) {
      assertDiagnosticsForPhase(DIAGNOSTIC_PHASES.COMPOSE, composeDiagnostics);
      for (const env of composeDiagnostics) {
        assertDiagnosticEnvelope(env);
      }
    }
  } catch (error) {
    const stageError = toPipelineStageError('compose', error);
    stages.compose = {
      status: 'failed',
      error: stageError,
    };
    errors.push(stageError);
    status = 'failed';
  } finally {
    metrics.end(METRIC_PHASE_BY_STAGE.compose);
    timeline.push('compose');
  }

  if (status === 'failed') {
    markRemainingStagesAsSkipped(stages, 'compose');
    return {
      status,
      schema,
      stages,
      metrics: metrics.snapshotMetrics({
        verbosity: options.snapshotVerbosity,
      }),
      timeline,
      errors,
      artifacts,
    };
  }

  // Generate stage
  let generated: GeneratorStageOutput | undefined;
  metrics.begin(METRIC_PHASE_BY_STAGE.generate);
  try {
    const eff = stages.compose.output!;
    generated = await Promise.resolve(runners.generate(eff, options.generate));
    stages.generate = { status: 'completed', output: generated };
    artifacts.generated = generated;

    // Runtime self-check: generator diagnostics must be allowed only in generate phase
    const genDiags: DiagnosticEnvelope[] = (generated?.diagnostics ?? []).map(
      (d) => ({ code: d.code, canonPath: d.canonPath, details: d.details })
    );
    if (genDiags.length > 0) {
      assertDiagnosticsForPhase(DIAGNOSTIC_PHASES.GENERATE, genDiags);
      for (const env of genDiags) {
        assertDiagnosticEnvelope(env);
      }
    }
  } catch (error) {
    const stageError = toPipelineStageError('generate', error);
    stages.generate = { status: 'failed', error: stageError };
    errors.push(stageError);
    status = 'failed';
  } finally {
    metrics.end(METRIC_PHASE_BY_STAGE.generate);
    timeline.push('generate');
  }

  if (status === 'failed') {
    markRemainingStagesAsSkipped(stages, 'generate');
    return {
      status,
      schema,
      stages,
      metrics: metrics.snapshotMetrics({
        verbosity: options.snapshotVerbosity,
      }),
      timeline,
      errors,
      artifacts,
    };
  }

  // Repair stage (AJV-driven budgeted corrections)
  let repaired: unknown[] | undefined;
  metrics.begin(METRIC_PHASE_BY_STAGE.repair);
  try {
    const eff = stages.compose.output!;
    const generatedOutput = stages.generate.output;
    const items = Array.isArray(generatedOutput?.items)
      ? generatedOutput.items
      : [];
    const out = await Promise.resolve(
      runners.repair(items, { schema, effective: eff }, options.repair)
    );
    type RepairActions = {
      action: string;
      canonPath: string;
      origPath?: string;
      instancePath?: string;
      details?: Record<string, unknown>;
    };
    type RepairObject = {
      items: unknown[];
      diagnostics?: DiagnosticEnvelope[];
      actions?: RepairActions[];
    };
    const isRepairObject = (v: unknown): v is RepairObject =>
      typeof v === 'object' &&
      v !== null &&
      'items' in (v as Record<string, unknown>) &&
      Array.isArray((v as { items?: unknown[] }).items);
    const normalizedItems = Array.isArray(out)
      ? out
      : isRepairObject(out)
        ? out.items
        : [];
    repaired = normalizedItems;
    stages.repair = { status: 'completed', output: repaired };
    artifacts.repaired = normalizedItems;
    if (isRepairObject(out) && out.diagnostics)
      artifacts.repairDiagnostics = out.diagnostics;
    // Runtime self-check: repair diagnostics must be allowed only in repair phase
    if (
      isRepairObject(out) &&
      Array.isArray(out.diagnostics) &&
      out.diagnostics.length > 0
    ) {
      assertDiagnosticsForPhase(DIAGNOSTIC_PHASES.REPAIR, out.diagnostics);
      for (const env of out.diagnostics) {
        assertDiagnosticEnvelope(env);
      }
    }
    if (isRepairObject(out) && out.actions) {
      artifacts.repairActions = out.actions;
      // Aggregate metrics: total repair actions applied across all items
      metrics.addRepairActions(out.actions.length);
    }
  } catch (error) {
    const stageError = toPipelineStageError('repair', error);
    stages.repair = { status: 'failed', error: stageError };
    errors.push(stageError);
    status = 'failed';
  } finally {
    metrics.end(METRIC_PHASE_BY_STAGE.repair);
    timeline.push('repair');
  }

  if (status === 'failed') {
    markRemainingStagesAsSkipped(stages, 'repair');
    return {
      status,
      schema,
      stages,
      metrics: metrics.snapshotMetrics({
        verbosity: options.snapshotVerbosity,
      }),
      timeline,
      errors,
      artifacts,
    };
  }

  // Validate stage (Dual AJV parity, validate against original)
  metrics.begin(METRIC_PHASE_BY_STAGE.validate);
  try {
    const generatedOutput = stages.generate.output;
    const generatedItems = Array.isArray(generatedOutput?.items)
      ? generatedOutput.items
      : [];
    const repairedItems = stages.repair.output as unknown[] | undefined;
    const items = repairedItems ?? generatedItems;
    const validation: ValidateStageResult = await Promise.resolve(
      runners.validate(items, schema, options.validate)
    );
    stages.validate = { status: 'completed', output: validation };
    artifacts.validation = validation;
    // If final validation fails, the pipeline must fail per SPEC (§6 Phases)
    if (validation.valid === false && validation.skippedValidation !== true) {
      status = 'failed';
      errors.push(
        new PipelineStageError('validate', 'FINAL_VALIDATION_FAILED')
      );
    }
    if (
      Array.isArray(validation.diagnostics) &&
      validation.diagnostics.length > 0
    ) {
      const diagList = validation.diagnostics;
      assertDiagnosticsForPhase(DIAGNOSTIC_PHASES.VALIDATE, diagList);
      for (const env of diagList) {
        assertDiagnosticEnvelope(env);
      }
      artifacts.validationDiagnostics = diagList;
    }
    // Expose AJV flags used during validation if provided by the validate runner
    if (validation.flags) {
      artifacts.validationFlags = validation.flags;
    }
    // Metrics: validations per row
    if (validation.skippedValidation === true) {
      metrics.addValidationCount(0);
    } else if (Array.isArray(items)) {
      metrics.addValidationCount(items.length);
    }
  } catch (error) {
    // If startup parity failed, mirror SPEC-required diagnostic AJV_FLAGS_MISMATCH
    if (error instanceof AjvFlagsMismatchError) {
      const diag: DiagnosticEnvelope = {
        code: DIAGNOSTIC_CODES.AJV_FLAGS_MISMATCH,
        canonPath: '',
        details: error.details as unknown,
      };
      try {
        assertDiagnosticEnvelope(diag);
        assertDiagnosticsForPhase(DIAGNOSTIC_PHASES.VALIDATE, [diag]);
      } catch {
        // If envelope assertion itself throws, continue to stage error
      }
      artifacts.validationDiagnostics = [diag];
    }
    if (error instanceof ExternalRefValidationError) {
      const diag = error.diagnostic;
      try {
        assertDiagnosticEnvelope(diag);
        assertDiagnosticsForPhase(DIAGNOSTIC_PHASES.VALIDATE, [diag]);
      } catch {
        // continue to stage error even if assertion throws
      }
      artifacts.validationDiagnostics = [diag];
    }
    const stageError = toPipelineStageError('validate', error);
    stages.validate = { status: 'failed', error: stageError };
    errors.push(stageError);
    status = 'failed';
  } finally {
    metrics.end(METRIC_PHASE_BY_STAGE.validate);
    timeline.push('validate');
  }

  return {
    status,
    schema,
    stages,
    metrics: metrics.snapshotMetrics({
      verbosity: options.snapshotVerbosity,
    }),
    timeline,
    errors,
    artifacts,
  };
}

function createDefaultGenerate(
  metrics: MetricsCollector,
  sourceSchema: unknown,
  pipelineOptions: PipelineOptions
): StageRunners['generate'] {
  return (effective, options) => {
    const generatorOptions: FoundryGeneratorOptions = {
      count: options?.count,
      seed: options?.seed,
      planOptions: options?.planOptions,
      metrics,
      sourceSchema,
      validateFormats: pipelineOptions.validate?.validateFormats,
      discriminator: pipelineOptions.validate?.discriminator,
    };
    return generateFromCompose(effective, generatorOptions);
  };
}

function createDefaultRepair(
  pipelineOptions: PipelineOptions
): (
  items: unknown[],
  _args: { schema: unknown; effective: ReturnType<typeof compose> },
  _options?: PipelineOptions['repair']
) => Promise<
  unknown[] | { items: unknown[]; diagnostics: DiagnosticEnvelope[] }
> {
  return async (items, _args, _options) => {
    const { schema, effective } = _args;
    const attempts = Math.max(1, Math.min(3, _options?.attempts ?? 1));
    const planOptions = pipelineOptions.generate?.planOptions;
    try {
      return repairItemsAjvDriven(
        items,
        { schema, effective, planOptions },
        { attempts }
      );
    } catch {
      // Conservative: on any unexpected error, fall back to pass-through
      return items as unknown[];
    }
  };
}

function createDefaultValidate(
  pipelineOptions: PipelineOptions
): StageRunners['validate'] {
  return async (items, schema, options) => {
    // Dual AJV with startup parity checks
    // Conservative top-level dialect detection to avoid property-name collisions (e.g., { properties: { id: ... } })
    const dialect = ((): '2020-12' | '2019-09' | 'draft-07' | 'draft-04' => {
      if (schema && typeof schema === 'object') {
        const sch = (schema as Record<string, unknown>)['$schema'];
        if (typeof sch === 'string') {
          const lowered = sch.toLowerCase();
          if (lowered.includes('2020-12')) return '2020-12';
          if (lowered.includes('2019-09') || lowered.includes('draft-2019'))
            return '2019-09';
          if (lowered.includes('draft-07') || lowered.includes('draft-06'))
            return 'draft-07';
          if (lowered.includes('draft-04') || lowered.endsWith('/schema#'))
            return 'draft-04';
        }
      }
      return '2020-12';
    })();
    // Resolve plan options to align multipleOfPrecision when required by SPEC §13
    const planOptions = pipelineOptions.generate?.planOptions;
    const resolved = resolveOptions(planOptions);
    const shouldAlignMoP =
      resolved.rational.fallback === 'decimal' ||
      resolved.rational.fallback === 'float';
    const expectedMoP = shouldAlignMoP
      ? resolved.rational.decimalPrecision
      : undefined;

    // dialect resolved; proceed with AJV parity and validation
    const validateFormats = Boolean(options?.validateFormats);
    const discriminator = Boolean(options?.discriminator);
    const sourceAjv = createSourceAjv(
      {
        dialect,
        validateFormats,
        discriminator,
        multipleOfPrecision: expectedMoP,
      },
      planOptions
    );
    const planningAjv = createPlanningAjv(
      { validateFormats, discriminator, multipleOfPrecision: expectedMoP },
      planOptions
    );
    type AjvMarker = {
      __fd_ajvClass?: 'Ajv' | 'Ajv2019' | 'Ajv2020' | 'ajv-draft-04';
    };
    const sourceClass =
      (sourceAjv as unknown as AjvMarker).__fd_ajvClass ?? 'Ajv';

    checkAjvStartupParity(sourceAjv, planningAjv, {
      planningCompilesCanonical2020: true,
      validateFormats,
      discriminator,
      sourceClass,
      multipleOfPrecision: expectedMoP,
    });

    const flags = {
      source: extractAjvFlags(sourceAjv) as unknown as Record<string, unknown>,
      planning: extractAjvFlags(planningAjv) as unknown as Record<
        string,
        unknown
      >,
    };

    let validateFn: ValidateFunction;
    try {
      validateFn = sourceAjv.compile(schema as object);
    } catch (error) {
      const refs = extractExternalRefCandidates(error);
      if (refs.length > 0) {
        const sorted = [...refs].sort();
        const primary = sorted[0] ?? refs[0];
        const mode = pipelineOptions.mode ?? 'strict';
        const diag: DiagnosticEnvelope = {
          code: DIAGNOSTIC_CODES.EXTERNAL_REF_UNRESOLVED,
          canonPath: '',
          details: {
            ref: primary,
            mode,
            ...(mode === 'lax' ? { skippedValidation: true } : undefined),
          },
        };
        if (mode === 'lax') {
          return {
            valid: true,
            skippedValidation: true,
            diagnostics: [diag],
            flags,
          };
        }
        throw new ExternalRefValidationError(diag);
      }
      throw error;
    }
    const errors: unknown[] = [];
    let allValid = true;
    for (const it of items) {
      const ok = validateFn(it);
      if (!ok) {
        allValid = false;
        errors.push(validateFn.errors ?? []);
      }
    }
    return {
      valid: allValid,
      errors: errors.length ? errors : undefined,
      flags,
    };
  };
}

function extractExternalRefCandidates(error: unknown): string[] {
  const refs = new Set<string>();
  collectExternalRefCandidates(error, refs, 0);
  return Array.from(refs);
}

function collectExternalRefCandidates(
  value: unknown,
  refs: Set<string>,
  depth: number
): void {
  if (value === undefined || value === null) {
    return;
  }
  if (depth > 4) {
    return;
  }
  if (typeof value === 'string') {
    recordExternalRefCandidate(value, refs);
    return;
  }
  if (value instanceof Error) {
    recordExternalRefMessage(value.message, refs);
    collectExternalRefCandidates(
      (value as { cause?: unknown }).cause,
      refs,
      depth + 1
    );
  }
  if (typeof value !== 'object') {
    return;
  }
  const obj = value as Record<string, unknown>;
  recordExternalRefCandidate(obj.missingRef, refs);
  recordExternalRefCandidate(obj.missingSchema, refs);
  recordExternalRefCandidate(obj.ref, refs);
  if (Array.isArray(obj.refs)) {
    for (const entry of obj.refs) {
      recordExternalRefCandidate(entry, refs);
    }
  }
  if (obj.params && typeof obj.params === 'object') {
    const params = obj.params as Record<string, unknown>;
    recordExternalRefCandidate(params.ref, refs);
    if (Array.isArray(params.refs)) {
      for (const entry of params.refs) {
        recordExternalRefCandidate(entry, refs);
      }
    }
  }
  if (Array.isArray(obj.errors)) {
    for (const entry of obj.errors) {
      collectExternalRefCandidates(entry, refs, depth + 1);
    }
  }
  if ('cause' in obj) {
    collectExternalRefCandidates(
      (obj as { cause?: unknown }).cause,
      refs,
      depth + 1
    );
  }
  if ('message' in obj && typeof obj.message === 'string') {
    recordExternalRefMessage(obj.message, refs);
  }
}

function recordExternalRefMessage(
  message: string | undefined,
  refs: Set<string>
): void {
  if (!message) return;
  const regex = /reference\s+([^\s"'`]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(message)) !== null) {
    recordExternalRefCandidate(match[1], refs);
  }
}

function recordExternalRefCandidate(
  candidate: unknown,
  refs: Set<string>
): void {
  if (typeof candidate !== 'string') {
    return;
  }
  const trimmed = candidate.trim();
  if (!trimmed) {
    return;
  }
  if (!isLikelyExternalRef(trimmed)) {
    return;
  }
  refs.add(trimmed);
}

function isLikelyExternalRef(value: string): boolean {
  if (!value) {
    return false;
  }
  if (value.startsWith('#')) {
    return false;
  }
  return true;
}
