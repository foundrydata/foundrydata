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
import {
  evaluateGates,
  formatGateSummary,
  type GateResult,
} from '../gates/index.js';

const DEFAULT_INSTANCE_COUNT = 3;

export interface EngineRunOutput {
  report: Report;
  platformView: ReporterPlatformViewV1;
  coverageReport?: CoverageReport;
  metrics?: DiagMetrics;
  gates: GateResult;
  pipelineResult: PipelineResult;
}

export class PipelineRunFailedError extends Error {
  public readonly pipelineResult: PipelineResult;

  constructor(result: PipelineResult, cause?: unknown) {
    const stageError = result.errors?.[0];
    const message =
      stageError instanceof Error
        ? stageError.message
        : 'pipeline execution failed';
    super(message, cause ? { cause } : undefined);
    this.name = 'PipelineRunFailedError';
    this.pipelineResult = result;
  }
}

export async function runEngineOnSchema(
  options: EngineRunOptions
): Promise<Report> {
  const { report, gates } = await runEngineWithArtifacts(options);
  assertGatesPass(gates);
  return report;
}

// eslint-disable-next-line complexity
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
    metricsEnabled: pipelineResult.metricsEnabled,
    engineVersion:
      pipelineResult.artifacts.coverageReport?.engine.foundryVersion,
    ajvMajor: pipelineResult.artifacts.coverageReport?.engine.ajvMajor,
  });
  const gateConfig = {
    ...options.gateConfig,
    minCoverage:
      options.gateConfig?.minCoverage ?? options.coverage?.minCoverage,
  };
  const gates = evaluateGates(
    {
      fatalDiagnostics: pipelineResult.artifacts.effective?.diag?.fatal,
      warnDiagnostics: pipelineResult.artifacts.effective?.diag?.warn,
      repairDiagnostics: pipelineResult.artifacts.repairDiagnostics,
      metrics: pipelineResult.metrics,
      coverage: platformView.metrics.coverage,
    },
    gateConfig
  );
  return {
    report,
    platformView,
    coverageReport: pipelineResult.artifacts.coverageReport,
    metrics: pipelineResult.metrics,
    gates,
    pipelineResult,
  };
}

function ensurePipelineCompleted(result: PipelineResult): void {
  if (result.status === 'completed') {
    return;
  }
  const stageError = result.errors?.[0];
  throw new PipelineRunFailedError(result, stageError);
}

function buildPipelineOptions(options: EngineRunOptions): PipelineOptions {
  const count = options.maxInstances ?? DEFAULT_INSTANCE_COUNT;
  const coverageOptions =
    options.coverage ??
    ({
      mode: 'measure',
      excludeUnreachable: false,
    } satisfies PipelineOptions['coverage']);
  const repairAttempts = coverageOptions.mode === 'guided' ? 3 : 1;
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
      attempts: repairAttempts,
    },
    validate: {
      validateFormats: true,
    },
    metrics: { enabled: true },
    coverage: coverageOptions,
  } satisfies PipelineOptions;
}

function assertGatesPass(gates: GateResult): void {
  if (gates.status !== 'fail') {
    return;
  }
  const summary = formatGateSummary(gates);
  throw new Error(`Gate failure: ${summary}`);
}
