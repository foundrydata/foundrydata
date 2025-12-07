import {
  executePipeline,
  type PipelineOptions,
  type PipelineResult,
} from '@foundrydata/core';
import type { CoverageReport, DiagMetrics } from '@foundrydata/shared';

import type { Report } from '../model/report.js';
import { buildReportFromPipeline } from './report-builder.js';
import type { EngineRunOptions } from './types.js';
import {
  buildReporterPlatformView,
  type ReporterPlatformViewV1,
} from '../platform-view/index.js';

const DEFAULT_INSTANCE_COUNT = 3;

export interface EngineRunOutput {
  report: Report;
  platformView: ReporterPlatformViewV1;
  coverageReport?: CoverageReport;
  metrics?: DiagMetrics;
  pipelineResult: PipelineResult;
}

export async function runEngineOnSchema(
  options: EngineRunOptions
): Promise<Report> {
  const { report } = await runEngineWithArtifacts(options);
  return report;
}

export async function runEngineWithArtifacts(
  options: EngineRunOptions
): Promise<EngineRunOutput> {
  const pipelineOptions = buildPipelineOptions(options);
  const pipelineResult = await executePipeline(options.schema, pipelineOptions);
  ensurePipelineCompleted(pipelineResult);
  const report = buildReportFromPipeline(options, pipelineResult);
  const platformView = buildReporterPlatformView({
    metrics: pipelineResult.metrics,
    coverageReport: pipelineResult.artifacts.coverageReport,
    seed: pipelineResult.artifacts.generated?.seed ?? options.seed,
    registryFingerprint:
      pipelineResult.artifacts.coverageReport?.run.registryFingerprint,
    engineVersion:
      pipelineResult.artifacts.coverageReport?.engine.foundryVersion,
    ajvMajor: pipelineResult.artifacts.coverageReport?.engine.ajvMajor,
  });
  return {
    report,
    platformView,
    coverageReport: pipelineResult.artifacts.coverageReport,
    metrics: pipelineResult.metrics,
    pipelineResult,
  };
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
      validateFormats: true,
    },
    metrics: { enabled: true },
  } satisfies PipelineOptions;
}
