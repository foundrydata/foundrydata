import type {
  NormalizeOptions,
  NormalizeResult,
} from '../transform/schema-normalizer';
import type {
  ComposeOptions,
  ComposeResult,
  ComposeInput,
} from '../transform/composition-engine';
import type {
  MetricsCollector,
  MetricsCollectorOptions,
  MetricsSnapshot,
  MetricsVerbosity,
} from '../util/metrics';

export type PipelineStageName =
  | 'normalize'
  | 'compose'
  | 'generate'
  | 'repair'
  | 'validate';

export type PipelineStageStatus =
  | 'pending'
  | 'completed'
  | 'failed'
  | 'skipped';

export type PipelineStatus = 'completed' | 'failed';

export class PipelineStageError extends Error {
  public readonly stage: PipelineStageName;
  public readonly cause: unknown;

  constructor(stage: PipelineStageName, message: string, cause?: unknown) {
    if (cause === undefined) {
      super(message);
    } else {
      super(message, { cause });
    }
    this.name = 'PipelineStageError';
    this.stage = stage;
    this.cause = cause;
  }
}

export interface PipelineStageReport<TOutput> {
  status: PipelineStageStatus;
  output?: TOutput;
  error?: PipelineStageError;
}

export interface PipelineStages {
  normalize: PipelineStageReport<NormalizeResult>;
  compose: PipelineStageReport<ComposeResult>;
  generate: PipelineStageReport<unknown>;
  repair: PipelineStageReport<unknown>;
  validate: PipelineStageReport<unknown>;
}

export interface PipelineArtifacts {
  canonical?: NormalizeResult;
  effective?: ComposeResult;
  generated?: unknown[];
  repaired?: unknown[];
  validation?: { valid: boolean; errors?: unknown[] };
}

export interface PipelineStageOverrides {
  normalize?: (schema: unknown, options?: NormalizeOptions) => NormalizeResult;
  compose?: (input: ComposeInput, options?: ComposeOptions) => ComposeResult;
  generate?: (
    effective: ComposeResult,
    options?: PipelineOptions['generate']
  ) => unknown[] | Promise<unknown[]>;
  repair?: (
    items: unknown[],
    args: { schema: unknown; effective: ComposeResult },
    options?: PipelineOptions['repair']
  ) => unknown[] | Promise<unknown[]>;
  validate?: (
    items: unknown[],
    schema: unknown,
    options?: PipelineOptions['validate']
  ) =>
    | { valid: boolean; errors?: unknown[] }
    | Promise<{ valid: boolean; errors?: unknown[] }>;
}

export interface PipelineOptions {
  normalize?: NormalizeOptions;
  compose?: ComposeOptions;
  metrics?: MetricsCollectorOptions;
  collector?: MetricsCollector;
  snapshotVerbosity?: MetricsVerbosity;
  mode?: 'strict' | 'lax';
  generate?: {
    count?: number;
    seed?: number;
  };
  repair?: {
    attempts?: number;
  };
  validate?: {
    /** When true, apply ajv-formats to both instances */
    validateFormats?: boolean;
    /** Enable discriminator support on both instances */
    discriminator?: boolean;
  };
}

export interface PipelineResult {
  status: PipelineStatus;
  schema: unknown;
  stages: PipelineStages;
  metrics: MetricsSnapshot;
  timeline: PipelineStageName[];
  errors: PipelineStageError[];
  artifacts: PipelineArtifacts;
}
