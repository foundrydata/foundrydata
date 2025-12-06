import { describe, expect, it } from 'vitest';

import { executePipeline } from '../orchestrator';
import type { DiagnosticEnvelope } from '../../diag/validate.js';
import type { PipelineResult, PipelineStatus } from '../types';

type StrippedResult = {
  status: PipelineStatus;
  timeline: PipelineResult['timeline'];
  errors: Array<{ stage: string; message: string }>;
  artifacts: {
    generated: PipelineResult['artifacts']['generated'];
    repaired: PipelineResult['artifacts']['repaired'];
    repairActions: PipelineResult['artifacts']['repairActions'];
    validationDiagnostics: Array<Omit<DiagnosticEnvelope, 'metrics'>>;
    repairDiagnostics: Array<Omit<DiagnosticEnvelope, 'metrics'>>;
  };
};

function stripDiagnostics(
  diagnostics: DiagnosticEnvelope[] | undefined
): Array<Omit<DiagnosticEnvelope, 'metrics'>> {
  if (!diagnostics) {
    return [];
  }
  return diagnostics.map(({ metrics: _metrics, ...rest }) => rest);
}

function stripResult(result: PipelineResult): StrippedResult {
  return {
    status: result.status,
    timeline: result.timeline,
    errors: result.errors.map((error) => ({
      stage: error.stage,
      message: error.message,
    })),
    artifacts: {
      generated: result.artifacts.generated?.items,
      repaired: result.artifacts.repaired,
      repairActions: result.artifacts.repairActions,
      validationDiagnostics: stripDiagnostics(
        result.artifacts.validationDiagnostics
      ),
      repairDiagnostics: stripDiagnostics(result.artifacts.repairDiagnostics),
    },
  };
}

describe('metrics toggle', () => {
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'integer', minimum: 0 },
      name: { type: 'string', minLength: 1 },
      tags: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 3,
      },
    },
    required: ['id', 'name'],
  } as const;

  async function runPipeline(metricsEnabled: boolean): Promise<PipelineResult> {
    return executePipeline(schema, {
      metrics: { enabled: metricsEnabled, verbosity: 'ci' },
      generate: { count: 3, seed: 37 },
      validate: { validateFormats: false },
    });
  }

  it('keeps outputs and diagnostics identical when toggling metrics on/off', async () => {
    const withMetrics = await runPipeline(true);
    const withoutMetrics = await runPipeline(false);

    const strippedOn = stripResult(withMetrics);
    const strippedOff = stripResult(withoutMetrics);

    expect(strippedOn).toStrictEqual(strippedOff);

    // Metrics snapshot should be populated when enabled and remain zeroed when disabled.
    expect(withMetrics.metrics.normalizeMs).toBeGreaterThanOrEqual(0);
    expect(withMetrics.metrics.generateMs).toBeGreaterThanOrEqual(0);
    expect(withMetrics.metrics.validationsPerRow).toBeGreaterThanOrEqual(0);
    expect(withoutMetrics.metrics.normalizeMs).toBe(0);
    expect(withoutMetrics.metrics.generateMs).toBe(0);
    expect(withoutMetrics.metrics.validationsPerRow).toBe(0);
    // SLIs stay zero in both modes unless explicitly enabled by the bench harness.
    expect(withMetrics.metrics.p50LatencyMs).toBe(0);
    expect(withMetrics.metrics.p95LatencyMs).toBe(0);
    expect(withMetrics.metrics.memoryPeakMB).toBe(0);
    expect(withoutMetrics.metrics.p50LatencyMs).toBe(0);
    expect(withoutMetrics.metrics.p95LatencyMs).toBe(0);
    expect(withoutMetrics.metrics.memoryPeakMB).toBe(0);
  });
});
