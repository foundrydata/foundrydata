/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
import {
  normalize,
  type NormalizeResult,
} from '../transform/schema-normalizer';
import { compose, type ComposeOptions } from '../transform/composition-engine';
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
  canonicalSchema: unknown,
  options?: PipelineOptions['compose']
) => ReturnType<typeof compose>;

interface StageRunners {
  normalize: NormalizeRunner;
  compose: ComposeRunner;
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
    const canonicalSchema = normalizeResult?.schema ?? schema;
    let composeOptions: ComposeOptions | undefined =
      options.compose !== undefined ? { ...options.compose } : undefined;
    if (options.mode !== undefined) {
      if (!composeOptions) {
        composeOptions = { mode: options.mode };
      } else if (composeOptions.mode === undefined) {
        composeOptions.mode = options.mode;
      }
    }
    const composeResult = runners.compose(canonicalSchema, composeOptions);
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
