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
  detectDialectFromSchema,
  type JsonSchemaDialect,
} from '../util/ajv-source.js';
import type { Dialect } from '../dialect/detectDialect.js';
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
import { ResolutionRegistry } from '../resolver/registry.js';
import {
  resolveAllExternalRefs,
  type ResolverDiagnosticNote,
  type ResolverOptions as ResolverExtensionOptions,
} from '../resolver/options.js';
import {
  hydrateSourceAjvFromRegistry,
  type RegistryDoc,
} from '../resolver/hydrateSourceAjvFromRegistry.js';
import {
  analyzeCoverage,
  type CoverageAnalyzerInput,
} from '../coverage/analyzer.js';
import {
  type CoverageAccumulator,
  createStreamingCoverageAccumulator,
  type StreamingCoverageAccumulator,
  type InstanceCoverageState,
  type CoverageEvent,
  evaluateCoverage,
  type CoverageEvaluatorInput,
  applyReportModeToCoverageTargets,
  applyPlannerCaps,
  resolveCoveragePlannerConfig,
  type CoveragePlannerConfig,
} from '../coverage/index.js';
import {
  COVERAGE_REPORT_VERSION_V1,
  type CoverageMode,
  type CoverageReportMode,
  type CoverageThresholds,
  type PlannerCapHit,
} from '@foundrydata/shared';
import corePackageJson from '../../package.json' assert { type: 'json' };

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

type AjvMarker = {
  __fd_ajvClass?: 'Ajv' | 'Ajv2019' | 'Ajv2020' | 'ajv-draft-04';
};

type CoverageHookOptions = {
  mode: CoverageMode;
  emit: (event: CoverageEvent) => void;
  emitForItem?: (itemIndex: number, event: CoverageEvent) => void;
};

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

function collectSchemaIds(schema: unknown, acc: Set<string>): void {
  if (!schema || typeof schema !== 'object') return;
  const seen = new WeakSet<object>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (seen.has(node as object)) return;
    seen.add(node as object);
    if (Array.isArray(node)) {
      for (const entry of node) visit(entry);
      return;
    }
    const rec = node as Record<string, unknown>;
    const raw = rec['$id'];
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed) acc.add(trimmed);
    }
    for (const value of Object.values(rec)) {
      visit(value);
    }
  };
  visit(schema);
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

function shouldRunCoverageAnalyzer(
  coverageOptions: PipelineOptions['coverage']
): boolean {
  const mode = coverageOptions?.mode ?? 'off';
  return mode === 'measure' || mode === 'guided';
}

export async function executePipeline(
  schema: unknown,
  options: PipelineOptions = {},
  overrides: PipelineStageOverrides = {}
): Promise<PipelineResult> {
  const runStartTimeMs = Date.now();
  const runStartedAtIso = new Date(runStartTimeMs).toISOString();
  const metrics =
    options.collector ?? new MetricsCollector(options.metrics ?? {});
  const sourceDialect = detectDialectFromSchema(schema);
  const { schemaForAjv: schemaForSourceAjv } = prepareSchemaForSourceAjv(
    schema,
    sourceDialect
  );
  const planOptions = options.generate?.planOptions;
  const resolvedPlanOptions = resolveOptions(planOptions);
  // Optional resolver pre-phase (Extension R1)
  let resolverRegistry: ResolutionRegistry | undefined;
  let resolverRunDiags: ResolverDiagnosticNote[] | undefined = [];
  let registryFingerprint: string | undefined;
  let registryDocs: RegistryDoc[] | undefined;
  let pendingAjvMismatch: AjvFlagsMismatchError | undefined;
  // Track seen $id across AJV hydration to avoid duplicate-id conflicts
  const seenSchemaIds = new Map<string, string>();
  // Seed seenSchemaIds with any $id present in the root schema so that in-document definitions
  // take precedence over registry documents with the same identifier.
  const rootIds = new Set<string>();
  collectSchemaIds(schema, rootIds);
  for (const id of rootIds) {
    if (!seenSchemaIds.has(id)) {
      seenSchemaIds.set(id, 'root-schema');
    }
  }
  let ajvParityChecked = false;

  const runAjvStartupParityGate = (args: {
    validateFormats: boolean;
    discriminator: boolean;
    expectedMoP?: number;
    mode: PipelineOptions['mode'];
  }): void => {
    if (ajvParityChecked || pendingAjvMismatch) return;
    const sourceAjv = createSourceAjv(
      {
        dialect: sourceDialect,
        validateFormats: args.validateFormats,
        discriminator: args.discriminator,
        multipleOfPrecision: args.expectedMoP,
        tolerateInvalidPatterns: args.mode === 'lax',
      },
      planOptions
    );
    if (
      registryDocs &&
      resolverRegistry &&
      resolvedPlanOptions.resolver.hydrateFinalAjv === true
    ) {
      hydrateSourceAjvFromRegistry(sourceAjv, registryDocs, {
        ignoreIncompatible: true,
        notes: resolverRunDiags,
        seenSchemaIds: new Map(seenSchemaIds),
        targetDialect: sourceDialect,
      });
    }
    const planningAjv = createPlanningAjv(
      {
        validateFormats: args.validateFormats,
        discriminator: args.discriminator,
        multipleOfPrecision: args.expectedMoP,
      },
      planOptions
    );
    const sourceClass =
      (sourceAjv as unknown as AjvMarker).__fd_ajvClass ?? 'Ajv';

    try {
      checkAjvStartupParity(sourceAjv, planningAjv, {
        planningCompilesCanonical2020: true,
        validateFormats: args.validateFormats,
        discriminator: args.discriminator,
        sourceClass,
        multipleOfPrecision: args.expectedMoP,
        registryFingerprint,
        requireRegistryFingerprint: registryFingerprint !== undefined,
      });
      ajvParityChecked = true;
    } catch (error) {
      if (error instanceof AjvFlagsMismatchError) {
        pendingAjvMismatch = error;
        ajvParityChecked = true;
        return;
      }
      throw error;
    }
  };

  try {
    const resolverPlan = resolvedPlanOptions.resolver;
    const resolverOptions: ResolverExtensionOptions = {
      strategies: resolverPlan.strategies ?? ['local'],
      cacheDir: resolverPlan.cacheDir,
      hydrateFinalAjv: resolverPlan.hydrateFinalAjv,
      stubUnresolved:
        resolverPlan.stubUnresolved === 'emptySchema'
          ? 'emptySchema'
          : undefined,
      allowHosts: resolverPlan.allowlist,
      snapshotPath: resolverPlan.snapshotPath,
      maxDocs: resolverPlan.maxDocs,
      maxRefDepth: resolverPlan.maxRefDepth,
      maxBytesPerDoc: resolverPlan.maxBytesPerDoc,
      timeoutMs: resolverPlan.timeoutMs,
      followRedirects: resolverPlan.followRedirects,
      acceptYaml: resolverPlan.acceptYaml,
    };
    const resolverResult = await resolveAllExternalRefs(
      schema as object,
      resolverOptions
    );
    resolverRunDiags = resolverResult.notes;
    registryFingerprint = resolverResult.registryFingerprint;
    if (resolverResult.registry.size() > 0) {
      resolverRegistry = resolverResult.registry;
      const docs: RegistryDoc[] = [];
      for (const entry of resolverResult.registry.entries()) {
        const entryDialect =
          typeof entry.meta?.dialect === 'string'
            ? (entry.meta.dialect as unknown as Dialect)
            : undefined;
        docs.push({
          uri: entry.uri,
          schema: entry.schema,
          contentHash: entry.meta?.contentHash ?? entry.contentHash,
          dialect: entryDialect,
        });
      }
      registryDocs = docs;
    }
  } catch {
    // Pre-phase failures should not crash core pipeline; they will be reflected by run-level notes.
  }
  if (registryFingerprint === undefined) {
    registryFingerprint = '0';
  }
  const externalRefStrictPolicy =
    resolvedPlanOptions.failFast.externalRefStrict;
  let externalRefState: ExternalRefState | undefined;
  let canonicalSchema: unknown = schema;
  let coverageAccumulator: CoverageAccumulator | undefined;
  let streamingCoverageAccumulator: StreamingCoverageAccumulator | undefined;
  let perInstanceCoverageStates: InstanceCoverageState[] | undefined;
  let coverageHookOptions: CoverageHookOptions | undefined;
  let plannerCapsHit: PlannerCapHit[] = [];
  if (shouldRunCoverageAnalyzer(options.coverage)) {
    const coverageMode = options.coverage?.mode ?? 'off';
    if (coverageMode === 'measure' || coverageMode === 'guided') {
      const ensureInstanceCoverageState = (
        itemIndex: number
      ): InstanceCoverageState | undefined => {
        if (!streamingCoverageAccumulator) return undefined;
        if (!perInstanceCoverageStates) {
          perInstanceCoverageStates = [];
        }
        let state = perInstanceCoverageStates[itemIndex];
        if (!state) {
          state = streamingCoverageAccumulator.createInstanceState();
          perInstanceCoverageStates[itemIndex] = state;
        }
        return state;
      };
      const emit: (event: CoverageEvent) => void = (event) => {
        if (streamingCoverageAccumulator) {
          streamingCoverageAccumulator.record(event);
          return;
        }
        if (!coverageAccumulator) return;
        coverageAccumulator.record(event);
      };
      const emitForItem = (itemIndex: number, event: CoverageEvent): void => {
        const state = ensureInstanceCoverageState(itemIndex);
        if (state) {
          state.record(event);
          return;
        }
        emit(event);
      };
      coverageHookOptions = { mode: coverageMode, emit, emitForItem };
    }
  }
  const runners: StageRunners = {
    normalize: overrides.normalize ?? normalize,
    compose: overrides.compose ?? compose,
    generate:
      overrides.generate ??
      createDefaultGenerate(
        metrics,
        schema,
        options,
        {
          registryDocs,
          resolverHydrateFinalAjv: resolvedPlanOptions.resolver.hydrateFinalAjv,
          resolverNotes: resolverRunDiags,
          resolverSeenSchemaIds: seenSchemaIds,
          sourceDialect,
        },
        coverageHookOptions
      ),
    repair:
      overrides.repair ??
      createDefaultRepair(options, metrics, coverageHookOptions),
    validate:
      overrides.validate ??
      createDefaultValidate(
        options,
        () => externalRefState,
        externalRefStrictPolicy,
        resolvedPlanOptions,
        schemaForSourceAjv,
        resolverRegistry,
        resolverRunDiags,
        seenSchemaIds,
        registryDocs,
        () => pendingAjvMismatch,
        (index, itemValid) => {
          if (!streamingCoverageAccumulator || !perInstanceCoverageStates) {
            return;
          }
          const state = perInstanceCoverageStates[index];
          if (!state) {
            return;
          }
          if (itemValid) {
            streamingCoverageAccumulator.commitInstance(state);
          } else {
            state.reset();
          }
        }
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
    canonicalSchema = normalizeResult?.schema ?? schema;
    artifacts.canonical = normalizeResult;

    // Runtime self-check: diagnostics emitted during normalize must conform to phase rules
    const normalizeDiagnostics: DiagnosticEnvelope[] = (
      normalizeResult?.notes ?? []
    ).map((n) =>
      'phase' in n && typeof n.phase === 'string'
        ? (n as DiagnosticEnvelope)
        : {
            code: n.code,
            canonPath: n.canonPath,
            phase: DIAGNOSTIC_PHASES.NORMALIZE,
            details: n.details,
          }
    );
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
    const mode = options.mode ?? 'strict';
    runAjvStartupParityGate({
      validateFormats,
      discriminator,
      expectedMoP,
      mode,
    });
    if (schemaHasExternalRefs(schema)) {
      const sourceAjvFactory = (): Ajv => {
        const ajv = createSourceAjv(
          {
            dialect: sourceDialect,
            validateFormats,
            discriminator,
            multipleOfPrecision: expectedMoP,
            tolerateInvalidPatterns: mode === 'lax',
          },
          planOptions
        );
        if (registryDocs && resolverRegistry) {
          hydrateSourceAjvFromRegistry(ajv, registryDocs, {
            ignoreIncompatible: true,
            notes: resolverRunDiags,
            seenSchemaIds,
            targetDialect: sourceDialect,
          });
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
        if (!classification.skipEligible) {
          throw error;
        }
        const diag = createExternalRefDiagnostic(mode, classification, {
          skipValidation: mode === 'lax',
          policy: mode === 'strict' ? externalRefStrictPolicy : undefined,
        });
        if (mode === 'strict') {
          artifacts.validationDiagnostics = [diag];
          throw new ExternalRefValidationError(diag);
        }
        externalRefState = { diag, classification };
      }
      if (!externalRefState) {
        const externalSummary = summarizeExternalRefs(schema, {
          exclude: (ref) => isCanonicalMetaRef(ref, sourceDialect),
        });
        let unresolvedRefs = externalSummary.extRefs;
        if (
          resolverRegistry &&
          resolvedPlanOptions.resolver.hydrateFinalAjv === true &&
          unresolvedRefs.length > 0
        ) {
          const unresolved: string[] = [];
          for (const ref of unresolvedRefs) {
            const idx = ref.indexOf('#');
            const base = idx >= 0 ? ref.slice(0, idx) : ref;
            if (!base) continue;
            if (!resolverRegistry.get(base)) {
              unresolved.push(ref);
            }
          }
          unresolvedRefs = unresolved;
        }
        if (unresolvedRefs.length > 0) {
          const classification: ExternalRefClassification = {
            extRefs: unresolvedRefs,
            failingRefs: unresolvedRefs.slice(),
            exemplar: externalSummary.exemplar,
            skipEligible: false,
            reason: 'no-compile-errors',
          };
          const diag = createExternalRefDiagnostic(mode, classification, {
            skipValidation: mode === 'lax',
            policy: mode === 'strict' ? externalRefStrictPolicy : undefined,
          });
          if (mode === 'strict') {
            artifacts.validationDiagnostics = [diag];
            throw new ExternalRefValidationError(diag);
          }
          externalRefState = { diag, classification };
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
    if (registryDocs && resolverRegistry) {
      hydrateSourceAjvFromRegistry(planningForCompose, registryDocs, {
        ignoreIncompatible: true,
        notes: resolverRunDiags,
        seenSchemaIds,
        targetDialect: '2020-12',
      });
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
      // Propagate pipeline metrics collector into compose for R3 metrics.
      metrics,
    };
    // Apply Lax planning-time stubs when configured and unresolved externals are likely
    let stubbedRefs: string[] | undefined;
    if (
      mode === 'lax' &&
      resolvedPlanOptions.resolver.stubUnresolved === 'emptySchema'
    ) {
      try {
        // Determine if unresolved external refs remain after pre-phase
        const { probe, extRefs } = buildExternalRefProbeSchema(canonicalSchema);
        const unresolved = Array.isArray(extRefs)
          ? extRefs.filter((ref) => {
              const hashIdx = ref.indexOf('#');
              const base = hashIdx >= 0 ? ref.slice(0, hashIdx) : ref;
              if (!base) return true;
              if (!resolverRegistry) return true;
              return resolverRegistry.get(base) === undefined;
            })
          : [];
        if (unresolved.length > 0) {
          composeInput = { ...composeInput, schema: probe };
          stubbedRefs = unresolved;
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

      if (shouldRunCoverageAnalyzer(options.coverage)) {
        const coverageInput: CoverageAnalyzerInput = {
          canonSchema: canonicalSchema,
          ptrMap: normalizeResult?.ptrMap ?? new Map<string, string>(),
          coverageIndex: composeResult.coverageIndex,
          planDiag: composeResult.diag,
          dimensionsEnabled: options.coverage?.dimensionsEnabled,
        };
        const coverageResult = analyzeCoverage(coverageInput);
        artifacts.coverageGraph = coverageResult.graph;

        const coverageMode = options.coverage?.mode ?? 'off';
        const coverageDimensions =
          options.coverage?.dimensionsEnabled ?? undefined;

        if (coverageMode === 'guided') {
          const requestedCount = options.generate?.count;
          if (
            typeof requestedCount === 'number' &&
            Number.isFinite(requestedCount) &&
            requestedCount > 0
          ) {
            const plannerConfig: CoveragePlannerConfig =
              resolveCoveragePlannerConfig({
                maxInstances: requestedCount,
                dimensionsEnabled: coverageDimensions,
                dimensionPriority: options.coverage?.planner?.dimensionPriority,
                softTimeMs: options.coverage?.planner?.softTimeMs,
                caps: options.coverage?.planner?.caps,
              });
            const capsResult = applyPlannerCaps(
              coverageResult.targets,
              plannerConfig
            );
            artifacts.coverageTargets = capsResult.updatedTargets;
            plannerCapsHit = capsResult.capsHit;
          } else {
            artifacts.coverageTargets = coverageResult.targets;
          }
        } else {
          artifacts.coverageTargets = coverageResult.targets;
        }
        streamingCoverageAccumulator = createStreamingCoverageAccumulator(
          artifacts.coverageTargets
        );
        coverageAccumulator = streamingCoverageAccumulator;
      }
    }

    // Runtime self-check: diagnostics emitted during compose must conform to phase rules
    const composeDiagnostics: DiagnosticEnvelope[] = [
      ...(composeResult.diag?.fatal ?? []),
      ...(composeResult.diag?.warn ?? []),
    ].map((d) =>
      'phase' in d && typeof d.phase === 'string'
        ? (d as DiagnosticEnvelope)
        : {
            code: d.code,
            canonPath: d.canonPath,
            phase: DIAGNOSTIC_PHASES.COMPOSE,
            details: (d as DiagnosticEnvelope).details,
            metrics: (d as DiagnosticEnvelope).metrics,
            budget: (d as DiagnosticEnvelope).budget,
            scoreDetails: (d as DiagnosticEnvelope).scoreDetails,
          }
    );
    if (composeDiagnostics.length > 0) {
      assertDiagnosticsForPhase(DIAGNOSTIC_PHASES.COMPOSE, composeDiagnostics);
      for (const env of composeDiagnostics) {
        assertDiagnosticEnvelope(env);
      }
    }
  } catch (error) {
    if (error instanceof AjvFlagsMismatchError) {
      const snapshotForDiag = metrics.snapshotMetrics({
        verbosity: options.snapshotVerbosity,
      });
      const diag: DiagnosticEnvelope = {
        code: DIAGNOSTIC_CODES.AJV_FLAGS_MISMATCH,
        canonPath: '',
        phase: DIAGNOSTIC_PHASES.VALIDATE,
        details: error.details as unknown,
        metrics: {
          validationsPerRow: snapshotForDiag.validationsPerRow,
          repairPassesPerRow: snapshotForDiag.repairPassesPerRow,
          p50LatencyMs: snapshotForDiag.p50LatencyMs,
          p95LatencyMs: snapshotForDiag.p95LatencyMs,
          memoryPeakMB: snapshotForDiag.memoryPeakMB,
        },
      };
      try {
        assertDiagnosticEnvelope(diag);
        assertDiagnosticsForPhase(DIAGNOSTIC_PHASES.VALIDATE, [diag]);
      } catch {
        // continue to stage error even if assertion throws
      }
      artifacts.validationDiagnostics = [diag];
    }
    if (error instanceof ExternalRefValidationError) {
      const combined: DiagnosticEnvelope[] = [
        error.diagnostic.phase
          ? error.diagnostic
          : {
              ...error.diagnostic,
              phase: DIAGNOSTIC_PHASES.VALIDATE,
            },
      ];
      if (resolverRunDiags && resolverRunDiags.length > 0) {
        for (const note of resolverRunDiags) {
          combined.push({
            code: note.code,
            canonPath: note.canonPath,
            phase: DIAGNOSTIC_PHASES.COMPOSE,
            details: note.details,
          });
        }
      }
      artifacts.validationDiagnostics = combined;
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
      (d) => {
        const budget = d.budget
          ? {
              tried: d.budget.tried,
              limit: d.budget.limit,
              skipped: d.budget.skipped,
              reason:
                d.budget.reason === 'candidateBudget' ||
                d.budget.reason === 'witnessDomainExhausted'
                  ? 'complexityCap'
                  : d.budget.reason,
            }
          : undefined;
        return {
          code: d.code,
          canonPath: d.canonPath,
          phase: DIAGNOSTIC_PHASES.GENERATE,
          details: d.details,
          budget,
          scoreDetails: d.scoreDetails,
        };
      }
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
      const repairDiags: DiagnosticEnvelope[] = out.diagnostics.map(
        (d: DiagnosticEnvelope) => ({
          code: d.code,
          canonPath: d.canonPath,
          phase: DIAGNOSTIC_PHASES.REPAIR,
          details: d.details,
          metrics: d.metrics,
          budget: d.budget,
          scoreDetails: d.scoreDetails,
        })
      );
      assertDiagnosticsForPhase(DIAGNOSTIC_PHASES.REPAIR, repairDiags);
      for (const env of repairDiags) {
        assertDiagnosticEnvelope(env);
      }
      artifacts.repairDiagnostics = repairDiags;
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
      const diagList: DiagnosticEnvelope[] = validation.diagnostics.map(
        (d: DiagnosticEnvelope) => ({
          code: d.code,
          canonPath: d.canonPath,
          phase: DIAGNOSTIC_PHASES.VALIDATE,
          details: d.details,
          metrics: d.metrics,
          budget: d.budget,
          scoreDetails: d.scoreDetails,
        })
      );
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
      const snapshotForDiag = metrics.snapshotMetrics({
        verbosity: options.snapshotVerbosity,
      });
      const diag: DiagnosticEnvelope = {
        code: DIAGNOSTIC_CODES.AJV_FLAGS_MISMATCH,
        canonPath: '',
        phase: DIAGNOSTIC_PHASES.VALIDATE,
        details: error.details as unknown,
        metrics: {
          validationsPerRow: snapshotForDiag.validationsPerRow,
          repairPassesPerRow: snapshotForDiag.repairPassesPerRow,
          p50LatencyMs: snapshotForDiag.p50LatencyMs,
          p95LatencyMs: snapshotForDiag.p95LatencyMs,
          memoryPeakMB: snapshotForDiag.memoryPeakMB,
        },
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
      const diag: DiagnosticEnvelope = {
        ...error.diagnostic,
        phase: DIAGNOSTIC_PHASES.VALIDATE,
      };
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

  if (
    coverageAccumulator &&
    shouldRunCoverageAnalyzer(options.coverage) &&
    Array.isArray(artifacts.coverageTargets) &&
    status === 'completed'
  ) {
    const reportTargets = coverageAccumulator.toReport(
      artifacts.coverageTargets
    );

    artifacts.coverageTargets = reportTargets;

    const overallThreshold = options.coverage?.minCoverage;
    const thresholds: CoverageThresholds | undefined =
      typeof overallThreshold === 'number'
        ? { overall: overallThreshold }
        : undefined;

    const coverageInput: CoverageEvaluatorInput = {
      targets: reportTargets,
      dimensionsEnabled: options.coverage?.dimensionsEnabled ?? [],
      excludeUnreachable: options.coverage?.excludeUnreachable ?? false,
      thresholds,
    };

    const coverageResult = evaluateCoverage(coverageInput);
    artifacts.coverageMetrics = coverageResult.metrics;

    const reportMode: CoverageReportMode = 'full';
    const reportArrays = applyReportModeToCoverageTargets({
      reportMode,
      targets: reportTargets,
      uncoveredTargets: coverageResult.uncoveredTargets,
    });

    const generateOutput = stages.generate.output;
    const seed =
      (generateOutput && typeof generateOutput.seed === 'number'
        ? generateOutput.seed
        : options.generate?.seed) ?? 0;
    const maxInstances =
      options.generate?.count ??
      (Array.isArray(generateOutput?.items) ? generateOutput.items.length : 0);
    const actualInstances = Array.isArray(artifacts.repaired)
      ? artifacts.repaired.length
      : Array.isArray(generateOutput?.items)
        ? generateOutput.items.length
        : 0;

    const coverageMode = options.coverage?.mode ?? 'off';

    artifacts.coverageReport = {
      version: COVERAGE_REPORT_VERSION_V1,
      reportMode,
      engine: {
        foundryVersion:
          (corePackageJson as { version?: string }).version ?? '0.0.0',
        coverageMode,
        ajvMajor: 8,
      },
      run: {
        seed,
        masterSeed: seed,
        maxInstances,
        actualInstances,
        dimensionsEnabled: coverageInput.dimensionsEnabled,
        excludeUnreachable: coverageInput.excludeUnreachable,
        startedAt: runStartedAtIso,
        durationMs: Date.now() - runStartTimeMs,
      },
      metrics: coverageResult.metrics,
      targets: reportArrays.targets,
      uncoveredTargets: reportArrays.uncoveredTargets,
      unsatisfiedHints: [],
      diagnostics: {
        plannerCapsHit,
        notes: [],
      },
    };
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
  pipelineOptions: PipelineOptions,
  opts?: {
    registryDocs?: RegistryDoc[];
    resolverHydrateFinalAjv?: boolean;
    resolverNotes?: ResolverDiagnosticNote[];
    resolverSeenSchemaIds?: Map<string, string>;
    sourceDialect?: JsonSchemaDialect;
  },
  coverage?: CoverageHookOptions
): StageRunners['generate'] {
  return (effective, options) => {
    const generatorOptions: FoundryGeneratorOptions = {
      count: options?.count,
      seed: options?.seed,
      planOptions: options?.planOptions,
      preferExamples: pipelineOptions.generate?.preferExamples,
      metrics,
      sourceSchema,
      validateFormats: pipelineOptions.validate?.validateFormats,
      discriminator: pipelineOptions.validate?.discriminator,
      registryDocs: opts?.registryDocs,
      resolverHydrateFinalAjv: opts?.resolverHydrateFinalAjv,
      resolverNotes: opts?.resolverNotes,
      resolverSeenSchemaIds: opts?.resolverSeenSchemaIds,
      sourceDialect: opts?.sourceDialect,
      coverage: coverage && coverage.mode !== 'off' ? coverage : undefined,
    };
    return generateFromCompose(effective, generatorOptions);
  };
}

function createDefaultRepair(
  pipelineOptions: PipelineOptions,
  metrics: MetricsCollector,
  coverage?: CoverageHookOptions
): (
  items: unknown[],
  _args: { schema: unknown; effective: ReturnType<typeof compose> },
  _options?: PipelineOptions['repair']
) => Promise<
  unknown[] | { items: unknown[]; diagnostics: DiagnosticEnvelope[] }
> {
  return async (items, _args, _options) => {
    const { schema, effective } = _args;
    const planOptions = pipelineOptions.generate?.planOptions;
    try {
      return repairItemsAjvDriven(
        items,
        { schema, effective, planOptions },
        {
          attempts: _options?.attempts,
          metrics,
          coverage: coverage && coverage.mode !== 'off' ? coverage : undefined,
        }
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
  schemaForSourceAjvOverride?: unknown,
  resolverRegistry?: ResolutionRegistry,
  resolverRunDiags?: ResolverDiagnosticNote[],
  seenSchemaIds?: Map<string, string>,
  registryDocs?: RegistryDoc[],
  getPendingAjvMismatch?: () => AjvFlagsMismatchError | undefined,
  onInstanceValidated?: (index: number, valid: boolean) => void
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
    const dialect = detectDialectFromSchema(schema);
    const mode = pipelineOptions.mode ?? 'strict';

    if (getPendingAjvMismatch) {
      const mismatch = getPendingAjvMismatch();
      if (mismatch) {
        throw mismatch;
      }
    }

    const invalidPatternDiagnostics: DiagnosticEnvelope[] = [];

    const sourceAjvFactory = (): Ajv => {
      const ajv = createSourceAjv(
        {
          dialect,
          validateFormats,
          discriminator,
          multipleOfPrecision: expectedMoP,
          tolerateInvalidPatterns: mode === 'lax',
          onInvalidPatternDraft06:
            mode === 'lax'
              ? ({ pattern }) => {
                  invalidPatternDiagnostics.push({
                    code: 'DRAFT06_PATTERN_TOLERATED',
                    canonPath: '',
                    phase: DIAGNOSTIC_PHASES.VALIDATE,
                    details: { pattern },
                  });
                }
              : undefined,
        },
        planOptions
      );
      if (
        registryDocs &&
        resolverRegistry &&
        seenSchemaIds &&
        resolved.resolver.hydrateFinalAjv === true
      ) {
        hydrateSourceAjvFromRegistry(ajv, registryDocs, {
          ignoreIncompatible: true,
          notes: resolverRunDiags,
          seenSchemaIds,
          targetDialect: dialect,
        });
      }
      return ajv;
    };
    const sourceAjv = sourceAjvFactory();
    const planningAjv = createPlanningAjv(
      { validateFormats, discriminator, multipleOfPrecision: expectedMoP },
      planOptions
    );
    const flags = {
      source: extractAjvFlags(sourceAjv) as unknown as Record<string, unknown>,
      planning: extractAjvFlags(planningAjv) as unknown as Record<
        string,
        unknown
      >,
    };

    const externalState = getExternalRefState();
    if (externalState?.classification.skipEligible && mode === 'lax') {
      return {
        valid: true,
        skippedValidation: true,
        diagnostics: [externalState.diag],
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
        const diag = createExternalRefDiagnostic(mode, classification, {
          skipValidation: mode === 'lax',
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
        // In Strict mode, treat unresolved external $ref as a hard failure
        throw new ExternalRefValidationError(diag);
      }
      if (
        !classification.skipEligible &&
        classification.reason === 'no-external-refs' &&
        classification.failingRefs.length > 0
      ) {
        const primaryRef = classification.failingRefs[0] as string;
        const diag: DiagnosticEnvelope = {
          code: DIAGNOSTIC_CODES.SCHEMA_INTERNAL_REF_MISSING,
          canonPath: '',
          phase: DIAGNOSTIC_PHASES.VALIDATE,
          details: {
            ref: primaryRef,
            mode,
            failingRefs:
              classification.failingRefs.length > 1
                ? classification.failingRefs
                : undefined,
          },
        };
        throw new ExternalRefValidationError(diag);
      }
      const err = error instanceof Error ? error : undefined;
      const details: Record<string, unknown> = {
        message: err?.message ?? String(error),
      };
      if (classification.reason) {
        details.reason = classification.reason;
      }
      if (err?.name) {
        details.errorName = err.name;
      }
      const diag: DiagnosticEnvelope = {
        code: DIAGNOSTIC_CODES.VALIDATION_COMPILE_ERROR,
        canonPath: '',
        phase: DIAGNOSTIC_PHASES.VALIDATE,
        details,
      };
      throw new ExternalRefValidationError(diag);
    }
    const errors: unknown[] = [];
    const validationDiagnostics: DiagnosticEnvelope[] = [];
    let allValid = true;
    for (let index = 0; index < items.length; index += 1) {
      const it = items[index];
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
      if (onInstanceValidated) {
        try {
          onInstanceValidated(index, ok);
        } catch {
          // Coverage callbacks must never affect validation behavior.
        }
      }
    }
    const allDiagnostics =
      invalidPatternDiagnostics.length > 0 || validationDiagnostics.length > 0
        ? [...invalidPatternDiagnostics, ...validationDiagnostics]
        : undefined;

    return {
      valid: allValid,
      errors: errors.length ? errors : undefined,
      flags,
      diagnostics: allDiagnostics,
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
      phase: DIAGNOSTIC_PHASES.VALIDATE,
      details,
    });
  }
  return diagnostics;
}
