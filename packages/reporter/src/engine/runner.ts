import {
  executePipeline,
  type PipelineOptions,
  type PipelineResult,
} from '@foundrydata/core';

import type { Report } from '../model/report.js';
import { buildReportFromPipeline } from './report-builder.js';
import type { EngineRunOptions } from './types.js';

const DEFAULT_INSTANCE_COUNT = 3;

export async function runEngineOnSchema(
  options: EngineRunOptions
): Promise<Report> {
  const pipelineOptions = buildPipelineOptions(options);
  const pipelineResult = await executePipeline(options.schema, pipelineOptions);
  ensurePipelineCompleted(pipelineResult);
  return buildReportFromPipeline(options, pipelineResult);
}

function ensurePipelineCompleted(result: PipelineResult): void {
  if (result.status === 'completed') {
    return;
  }
  const stageError = result.errors[0];
  if (stageError) {
    throw stageError;
  }
  throw new Error('pipeline execution failed');
}

function buildPipelineOptions(options: EngineRunOptions): PipelineOptions {
  const count = options.maxInstances ?? DEFAULT_INSTANCE_COUNT;
  return {
    mode: 'strict',
    compose: options.planOptions
      ? { planOptions: options.planOptions }
      : undefined,
    generate: {
      count,
      seed: options.seed,
      planOptions: options.planOptions,
    },
    repair: {
      attempts: 1,
    },
    validate: {
      // Reporter default: annotate-only formats (profil minimal/realistic).
      // Strict Data Compliance / format-valid profiles will opt in explicitly.
      validateFormats: true,
    },
    metrics: { enabled: true },
  } satisfies PipelineOptions;
}
