/* eslint-disable max-lines */
/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
import {
  normalize,
  type NormalizeResult,
} from '../transform/schema-normalizer';
import {
  compose,
  type ComposeOptions,
  type ComposeInput,
} from '../transform/composition-engine';
import { createPlanningAjv } from '../util/ajv-planning';
import { createSourceAjv } from '../util/ajv-source';
import { checkAjvStartupParity } from '../util/ajv-gate';
import { MetricsCollector, type MetricPhase } from '../util/metrics';
import {
  PipelineStageError,
  type PipelineStageName,
  type PipelineStageOverrides,
  type PipelineOptions,
  type PipelineResult,
  type PipelineStages,
  type PipelineStatus,
  type PipelineArtifacts,
} from './types';

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
  ) => Promise<unknown[]> | unknown[];
  repair: (
    items: unknown[],
    args: { schema: unknown; effective: ReturnType<typeof compose> },
    options?: PipelineOptions['repair']
  ) => Promise<unknown[]> | unknown[];
  validate: (
    items: unknown[],
    schema: unknown,
    options?: PipelineOptions['validate']
  ) =>
    | Promise<{ valid: boolean; errors?: unknown[] }>
    | {
        valid: boolean;
        errors?: unknown[];
      };
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
    generate: overrides.generate ?? defaultGenerate,
    repair: overrides.repair ?? defaultRepair,
    validate: overrides.validate ?? defaultValidate,
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
    const composeResult = runners.compose(composeInput, composeOptions);
    stages.compose = {
      status: 'completed',
      output: composeResult,
    };
    artifacts.effective = composeResult;
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
  let generated: unknown[] | undefined;
  metrics.begin(METRIC_PHASE_BY_STAGE.generate);
  try {
    const eff = stages.compose.output!;
    generated = await Promise.resolve(runners.generate(eff, options.generate));
    stages.generate = { status: 'completed', output: generated };
    artifacts.generated = generated;
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
    const items = stages.generate.output as unknown[];
    repaired = await Promise.resolve(
      runners.repair(items, { schema, effective: eff }, options.repair)
    );
    stages.repair = { status: 'completed', output: repaired };
    artifacts.repaired = repaired;
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
    const items =
      (stages.repair.output as unknown[]) ??
      (stages.generate.output as unknown[]);
    const validation = await Promise.resolve(
      runners.validate(items, schema, options.validate)
    );
    stages.validate = { status: 'completed', output: validation };
    artifacts.validation = validation;
    // Metrics: validations per row
    if (Array.isArray(items)) {
      metrics.addValidationCount(items.length);
    }
  } catch (error) {
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

/**
 * Default generator: produce minimal items satisfying common constraints (best-effort).
 * Deterministic given seed in options; defaults to count=1.
 */
async function defaultGenerate(
  effective: ReturnType<typeof compose>,
  options?: PipelineOptions['generate']
): Promise<unknown[]> {
  const count = Math.max(1, Math.floor(options?.count ?? 1));
  const items: unknown[] = [];
  for (let i = 0; i < count; i += 1) {
    items.push(generateOne(effective.canonical.schema));
  }
  return items;
}

function generateOne(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return {};
  const s = schema as Record<string, unknown>;
  // const / enum take precedence
  if (Object.prototype.hasOwnProperty.call(s, 'const')) {
    return s.const;
  }
  if (Array.isArray(s.enum) && s.enum.length > 0) {
    return s.enum[0];
  }
  const t = s.type;
  if (
    t === 'object' ||
    (Array.isArray(t) && (t as string[]).includes('object'))
  ) {
    const required = new Set<string>(
      Array.isArray(s.required) ? (s.required as string[]) : []
    );
    const props = (s.properties ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) {
      if (required.has(k)) out[k] = generateOne(v);
    }
    return out;
  }
  if (
    t === 'array' ||
    (Array.isArray(t) && (t as string[]).includes('array'))
  ) {
    const minItems =
      typeof s.minItems === 'number' ? Math.max(0, s.minItems as number) : 0;
    const base = Array.isArray(s.prefixItems)
      ? (s.prefixItems as unknown[])
      : [];
    const itemSchema = s.items;
    const out: unknown[] = [];
    for (const pre of base) out.push(generateOne(pre));
    while (out.length < minItems) {
      out.push(generateOne(itemSchema));
    }
    return out;
  }
  if (
    t === 'string' ||
    (Array.isArray(t) && (t as string[]).includes('string'))
  ) {
    const minLength =
      typeof s.minLength === 'number' ? Math.max(0, s.minLength as number) : 0;
    const maxLength =
      typeof s.maxLength === 'number'
        ? Math.max(minLength, s.maxLength as number)
        : Math.max(1, minLength);
    const len = Math.min(Math.max(1, minLength), maxLength);
    return 'x'.repeat(len);
  }
  if (
    t === 'integer' ||
    (Array.isArray(t) && (t as string[]).includes('integer'))
  ) {
    let v = 0;
    if (typeof s.minimum === 'number')
      v = Math.max(v, Math.ceil(s.minimum as number));
    if (typeof s.exclusiveMinimum === 'number')
      v = Math.max(v, Math.ceil((s.exclusiveMinimum as number) + 1));
    if (typeof s.maximum === 'number')
      v = Math.min(v, Math.floor(s.maximum as number));
    return v;
  }
  if (
    t === 'number' ||
    (Array.isArray(t) && (t as string[]).includes('number'))
  ) {
    let v = 0;
    if (typeof s.minimum === 'number') v = Math.max(v, s.minimum as number);
    if (typeof s.exclusiveMinimum === 'number')
      v = Math.max(v, (s.exclusiveMinimum as number) + Number.EPSILON);
    if (typeof s.maximum === 'number') v = Math.min(v, s.maximum as number);
    return v;
  }
  if (
    t === 'boolean' ||
    (Array.isArray(t) && (t as string[]).includes('boolean'))
  ) {
    return true;
  }
  if (t === 'null' || (Array.isArray(t) && (t as string[]).includes('null'))) {
    return null;
  }
  // Fallback: empty object
  return {};
}

async function defaultRepair(
  items: unknown[],
  _args: { schema: unknown; effective: ReturnType<typeof compose> },
  _options?: PipelineOptions['repair']
): Promise<unknown[]> {
  // For now, pass-through (idempotent). Real repairs to be handled by Task 10.
  return items;
}

async function defaultValidate(
  items: unknown[],
  schema: unknown,
  options?: PipelineOptions['validate']
): Promise<{ valid: boolean; errors?: unknown[] }> {
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
  // dialect resolved; proceed with AJV parity and validation
  const validateFormats = Boolean(options?.validateFormats);
  const discriminator = Boolean(options?.discriminator);
  const sourceAjv = createSourceAjv(
    { dialect, validateFormats, discriminator },
    {}
  );
  const planningAjv = createPlanningAjv({ validateFormats, discriminator }, {});
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
  });

  const validateFn = sourceAjv.compile(schema as object);
  const errors: unknown[] = [];
  let allValid = true;
  for (const it of items) {
    const ok = validateFn(it);
    if (!ok) {
      allValid = false;
      errors.push(validateFn.errors ?? []);
    }
  }
  return { valid: allValid, errors: errors.length ? errors : undefined };
}
