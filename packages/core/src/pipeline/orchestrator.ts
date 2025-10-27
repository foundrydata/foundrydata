/* eslint-disable max-params */
/* eslint-disable max-depth */
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
import {
  createSourceAjv,
  extractAjvFlags,
  prepareSchemaForSourceAjv,
  isCanonicalMetaRef,
} from '../util/ajv-source.js';
import { checkAjvStartupParity } from '../util/ajv-gate.js';
import { MetricsCollector, type MetricPhase } from '../util/metrics.js';
import { resolveOptions, type ResolvedOptions } from '../types/options.js';
import type Ajv from 'ajv';
import type { ErrorObject, ValidateFunction } from 'ajv';
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
import {
  classifyExternalRefFailure,
  createExternalRefDiagnostic,
  schemaHasExternalRefs,
  summarizeExternalRefs,
  type ExternalRefClassification,
} from '../util/modes.js';
import { buildExternalRefProbeSchema } from '../util/modes.js';
import {
  prefetchAndBuildRegistry,
  type ResolverOptions as HttpResolverOptions,
} from '../resolver/http-resolver.js';
import { ResolutionRegistry } from '../resolver/registry.js';

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

type AjvKeywordError = ErrorObject<string, Record<string, unknown>, unknown>;

class ExternalRefValidationError extends Error {
  public readonly diagnostic: DiagnosticEnvelope;

  constructor(diagnostic: DiagnosticEnvelope) {
    super(DIAGNOSTIC_CODES.EXTERNAL_REF_UNRESOLVED);
    this.name = 'ExternalRefValidationError';
    this.diagnostic = diagnostic;
  }
}

interface ExternalRefState {
  diag: DiagnosticEnvelope;
  classification: ExternalRefClassification;
}

function determineSchemaDialect(
  schema: unknown
): '2020-12' | '2019-09' | 'draft-07' | 'draft-04' {
  if (schema && typeof schema === 'object') {
    const sch = (schema as Record<string, unknown>)['$schema'];
    if (typeof sch === 'string') {
      const lowered = sch.toLowerCase();
      if (lowered.includes('2020-12')) return '2020-12';
      if (lowered.includes('2019-09') || lowered.includes('draft-2019')) {
        return '2019-09';
      }
      if (lowered.includes('draft-07') || lowered.includes('draft-06')) {
        return 'draft-07';
      }
      if (lowered.includes('draft-04') || lowered.endsWith('/schema#')) {
        return 'draft-04';
      }
    }
  }
  return '2020-12';
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
  const sourceDialect = determineSchemaDialect(schema);
  const { schemaForAjv: schemaForSourceAjv } = prepareSchemaForSourceAjv(
    schema,
    sourceDialect
  );
  const planOptions = options.generate?.planOptions;
  const resolvedPlanOptions = resolveOptions(planOptions);
  // Optional resolver pre-phase (Extension R1)
  let resolverRegistry: ResolutionRegistry | undefined;
  let resolverRunDiags:
    | Array<{ code: string; canonPath: string; details?: unknown }>
    | undefined = [];
  let registryFingerprint: string | undefined;
  try {
    // Always log strategies applied for observability (run-level)
    const strategiesNote = {
      code: DIAGNOSTIC_CODES.RESOLVER_STRATEGIES_APPLIED as string,
      canonPath: '#',
      details: {
        strategies: resolvedPlanOptions.resolver.strategies,
        cacheDir: resolvedPlanOptions.resolver.cacheDir,
      },
    };
    resolverRunDiags.push(strategiesNote);
    if (schemaHasExternalRefs(schema)) {
      const resolver = resolvedPlanOptions.resolver;
      const strategies = resolver.strategies ?? ['local'];
      const mayFetch =
        strategies.includes('remote') || strategies.includes('schemastore');
      if (mayFetch) {
        const { extRefs } = summarizeExternalRefs(schema);
        const pre = await prefetchAndBuildRegistry(extRefs, {
          strategies,
          cacheDir: resolver.cacheDir,
          allowlist: resolver.allowlist,
          maxDocs: resolver.maxDocs,
          maxRefDepth: resolver.maxRefDepth,
          maxBytesPerDoc: resolver.maxBytesPerDoc,
          timeoutMs: resolver.timeoutMs,
          followRedirects: resolver.followRedirects,
          acceptYaml: resolver.acceptYaml,
        } as HttpResolverOptions);
        resolverRegistry = pre.registry;
        resolverRunDiags = pre.diagnostics;
        registryFingerprint = resolverRegistry.fingerprint();
      }
    }
  } catch {
    // Pre-phase failures should not crash core pipeline; they will be reflected by run-level notes.
  }
  const externalRefStrictPolicy =
    resolvedPlanOptions.failFast.externalRefStrict;
  let externalRefState: ExternalRefState | undefined;
  const runners: StageRunners = {
    normalize: overrides.normalize ?? normalize,
    compose: overrides.compose ?? compose,
    generate:
      overrides.generate ?? createDefaultGenerate(metrics, schema, options),
    repair: overrides.repair ?? createDefaultRepair(options),
    validate:
      overrides.validate ??
      createDefaultValidate(
        options,
        () => externalRefState,
        externalRefStrictPolicy,
        resolvedPlanOptions,
        schemaForSourceAjv
      ),
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
    let composeInput: ComposeInput =
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
    const shouldAlignMoP =
      resolvedPlanOptions.rational.fallback === 'decimal' ||
      resolvedPlanOptions.rational.fallback === 'float';
    const expectedMoP = shouldAlignMoP
      ? resolvedPlanOptions.rational.decimalPrecision
      : undefined;
    const validateFormats = Boolean(options.validate?.validateFormats);
    const discriminator = Boolean(options.validate?.discriminator);
    if (schemaHasExternalRefs(schema)) {
      const mode = options.mode ?? 'strict';
      const sourceAjvFactory = (): Ajv => {
        const ajv = createSourceAjv(
          {
            dialect: sourceDialect,
            validateFormats,
            discriminator,
            multipleOfPrecision: expectedMoP,
          },
          planOptions
        );
        // Hydrate Source Ajv with resolver registry if available
        if (resolverRegistry) {
          for (const entry of resolverRegistry.entries()) {
            try {
              (
                ajv as unknown as {
                  addSchema: (s: unknown, key?: string) => void;
                }
              ).addSchema(entry.schema as object, entry.uri);
            } catch {
              // ignore addSchema failures; AJV may reject missing $id
            }
          }
        }
        return ajv;
      };
      try {
        const sourceAjv = sourceAjvFactory();
        sourceAjv.compile(schemaForSourceAjv as object);
      } catch (error) {
        const classification = classifyExternalRefFailure({
          schema,
          error,
          createSourceAjv: sourceAjvFactory,
        });
        if (classification.skipEligible) {
          const skipValidation =
            mode === 'lax' ||
            (mode === 'strict' && externalRefStrictPolicy !== 'error');
          const diag = createExternalRefDiagnostic(mode, classification, {
            skipValidation,
            policy: mode === 'strict' ? externalRefStrictPolicy : undefined,
          });
          if (mode === 'strict') {
            if (externalRefStrictPolicy === 'error') {
              artifacts.validationDiagnostics = [diag];
              throw new ExternalRefValidationError(diag);
            }
            externalRefState = { diag, classification };
          } else {
            externalRefState = { diag, classification };
          }
        } else {
          throw error;
        }
      }
      if (!externalRefState) {
        const externalSummary = summarizeExternalRefs(schema, {
          exclude: (ref) => isCanonicalMetaRef(ref, sourceDialect),
        });
        if (externalSummary.extRefs.length > 0) {
          const classification: ExternalRefClassification = {
            extRefs: externalSummary.extRefs,
            failingRefs: externalSummary.extRefs.slice(),
            exemplar: externalSummary.exemplar,
            skipEligible: false,
            reason: 'no-compile-errors',
          };
          const skipValidation =
            mode === 'lax' ||
            (mode === 'strict' && externalRefStrictPolicy !== 'error');
          const diag = createExternalRefDiagnostic(mode, classification, {
            skipValidation,
            policy: mode === 'strict' ? externalRefStrictPolicy : undefined,
          });
          if (mode === 'strict') {
            if (externalRefStrictPolicy === 'error') {
              artifacts.validationDiagnostics = [diag];
              throw new ExternalRefValidationError(diag);
            }
            externalRefState = { diag, classification };
          } else {
            externalRefState = { diag, classification };
          }
        }
      }
    }
    const planningForCompose = createPlanningAjv(
      {
        validateFormats,
        discriminator,
        multipleOfPrecision: expectedMoP,
      },
      planOptions
    );
    // Hydrate planning Ajv with resolver registry for in-planning compiles
    if (resolverRegistry) {
      for (const entry of resolverRegistry.entries()) {
        try {
          (
            planningForCompose as unknown as {
              addSchema: (s: unknown, key?: string) => void;
            }
          ).addSchema(entry.schema as object, entry.uri);
        } catch {
          // ignore
        }
      }
    }
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
      // Ensure cache/memo keys incorporate resolver fingerprint per SPEC §14
      selectorMemoKeyFn: registryFingerprint
        ? (_: string, __: number) => registryFingerprint as string
        : undefined,
    };
    // Apply Lax planning-time stubs when configured and unresolved externals are likely
    const mode = options.mode ?? 'strict';
    let stubbedRefs: string[] | undefined;
    if (
      mode === 'lax' &&
      resolvedPlanOptions.resolver.stubUnresolved === 'emptySchema'
    ) {
      try {
        // Determine if unresolved external refs remain after pre-phase
        const { probe, extRefs } = buildExternalRefProbeSchema(schema);
        if (Array.isArray(extRefs) && extRefs.length > 0) {
          composeInput = { ...composeInput, schema: probe };
          stubbedRefs = extRefs;
        }
      } catch {
        // ignore
      }
    }
    const composeResult = runners.compose(composeInput, composeOptions);
    if (stubbedRefs && stubbedRefs.length > 0) {
      composeResult.diag = composeResult.diag ?? {};
      const warn = composeResult.diag.warn ?? [];
      for (const ref of stubbedRefs) {
        warn.push({
          code: DIAGNOSTIC_CODES.EXTERNAL_REF_STUBBED,
          canonPath: '#',
          details: { ref, stubKind: 'emptySchema' },
        });
      }
      composeResult.diag.warn = warn;
    }
    // Attach run-level resolver diagnostics if present
    if (resolverRunDiags && resolverRunDiags.length > 0) {
      composeResult.diag = composeResult.diag ?? {};
      composeResult.diag.run = [
        ...(composeResult.diag.run ?? []),
        ...resolverRunDiags,
      ];
    }
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
    if (error instanceof ExternalRefValidationError) {
      artifacts.validationDiagnostics = [error.diagnostic];
    }
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
  pipelineOptions: PipelineOptions,
  getExternalRefState: () => ExternalRefState | undefined,
  externalRefPolicy: ResolvedOptions['failFast']['externalRefStrict'],
  preResolvedPlanOptions?: ResolvedOptions,
  schemaForSourceAjvOverride?: unknown
): StageRunners['validate'] {
  return async (items, schema, options) => {
    const planOptions = pipelineOptions.generate?.planOptions;
    const resolved = preResolvedPlanOptions ?? resolveOptions(planOptions);
    const shouldAlignMoP =
      resolved.rational.fallback === 'decimal' ||
      resolved.rational.fallback === 'float';
    const expectedMoP = shouldAlignMoP
      ? resolved.rational.decimalPrecision
      : undefined;

    const validateFormats = Boolean(options?.validateFormats);
    const discriminator = Boolean(options?.discriminator);
    const dialect = determineSchemaDialect(schema);
    const mode = pipelineOptions.mode ?? 'strict';

    const sourceAjvFactory = (): Ajv =>
      createSourceAjv(
        {
          dialect,
          validateFormats,
          discriminator,
          multipleOfPrecision: expectedMoP,
        },
        planOptions
      );
    const sourceAjv = sourceAjvFactory();
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

    const externalState = getExternalRefState();
    if (externalState?.classification.skipEligible) {
      const shouldEmitDiag =
        mode === 'strict' ? externalRefPolicy !== 'ignore' : true;
      return {
        valid: true,
        skippedValidation: true,
        diagnostics: shouldEmitDiag ? [externalState.diag] : undefined,
        flags,
      };
    }

    const compileTarget = schemaForSourceAjvOverride ?? schema;
    let validateFn: ValidateFunction;
    try {
      validateFn = sourceAjv.compile(compileTarget as object);
    } catch (error) {
      const classification = classifyExternalRefFailure({
        schema,
        error,
        createSourceAjv: sourceAjvFactory,
      });
      if (classification.skipEligible) {
        const skipValidation =
          mode === 'lax' ||
          (mode === 'strict' && externalRefPolicy !== 'error');
        const diag = createExternalRefDiagnostic(mode, classification, {
          skipValidation,
          policy: mode === 'strict' ? externalRefPolicy : undefined,
        });
        if (mode === 'lax') {
          return {
            valid: true,
            skippedValidation: true,
            diagnostics: [diag],
            flags,
          };
        }
        if (externalRefPolicy === 'error') {
          throw new ExternalRefValidationError(diag);
        }
        const shouldEmitDiag = externalRefPolicy !== 'ignore';
        return {
          valid: true,
          skippedValidation: true,
          diagnostics: shouldEmitDiag ? [diag] : undefined,
          flags,
        };
      }
      throw error;
    }
    const errors: unknown[] = [];
    const validationDiagnostics: DiagnosticEnvelope[] = [];
    let allValid = true;
    for (const it of items) {
      const ok = validateFn(it);
      if (!ok) {
        allValid = false;
        const failureErrors = Array.isArray(validateFn.errors)
          ? (validateFn.errors as AjvKeywordError[]).map((err) => ({ ...err }))
          : [];
        errors.push(failureErrors);
        if (failureErrors.length > 0) {
          validationDiagnostics.push(...ajvErrorsToDiagnostics(failureErrors));
        }
      }
    }
    return {
      valid: allValid,
      errors: errors.length ? errors : undefined,
      flags,
      diagnostics:
        validationDiagnostics.length > 0 ? validationDiagnostics : undefined,
    };
  };
}

function normalizeSchemaCanonPath(schemaPath?: string | null): string {
  if (!schemaPath) {
    return '';
  }
  const trimmed = schemaPath.trim();
  if (!trimmed || trimmed === '#') {
    return '';
  }
  const withoutHash = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  if (!withoutHash) {
    return '';
  }
  return withoutHash.startsWith('/') ? withoutHash : `/${withoutHash}`;
}

function ajvErrorsToDiagnostics(
  errors: readonly AjvKeywordError[]
): DiagnosticEnvelope[] {
  if (!Array.isArray(errors) || errors.length === 0) {
    return [];
  }
  const diagnostics: DiagnosticEnvelope[] = [];
  for (const err of errors) {
    if (!err || typeof err !== 'object') {
      continue;
    }
    const keyword =
      typeof err.keyword === 'string' && err.keyword.length > 0
        ? err.keyword
        : 'unknown';
    const details: Record<string, unknown> = { keyword };
    if (typeof err.message === 'string' && err.message.length > 0) {
      details.message = err.message;
    }
    if (typeof err.schemaPath === 'string' && err.schemaPath.length > 0) {
      details.schemaPath = err.schemaPath;
    }
    if (typeof err.instancePath === 'string' && err.instancePath.length > 0) {
      details.instancePath = err.instancePath;
    }
    if (err.params !== undefined) {
      details.params = err.params;
    }
    diagnostics.push({
      code: DIAGNOSTIC_CODES.VALIDATION_KEYWORD_FAILED,
      canonPath: normalizeSchemaCanonPath(err.schemaPath),
      details,
    });
  }
  return diagnostics;
}
