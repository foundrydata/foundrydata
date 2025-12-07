import { describe, expect, it } from 'vitest';

import { executePipeline } from '../orchestrator';
import type { PipelineResult } from '../types';
import type { CoverageDimension, CoverageReport } from '@foundrydata/shared';
import { normalizePipelineResultForDeterminism } from '../../../test/util/determinism-compare.js';

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

  function normalizeCoverageReport(
    report: CoverageReport | undefined
  ): CoverageReport | undefined {
    if (!report) return report;
    return {
      ...report,
      run: {
        ...report.run,
        startedAt: 'normalized',
        durationMs: 0,
        metricsEnabled: true,
      },
    };
  }

  it('keeps outputs and diagnostics identical when toggling metrics on/off', async () => {
    const withMetrics = await runPipeline(true);
    const withoutMetrics = await runPipeline(false);

    const strippedOn = normalizePipelineResultForDeterminism(withMetrics, {
      includeMetrics: false,
    });
    const strippedOff = normalizePipelineResultForDeterminism(withoutMetrics, {
      includeMetrics: false,
    });

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
    expect(withMetrics.metricsEnabled).toBe(true);
    expect(withoutMetrics.metricsEnabled).toBe(false);
  });

  it('keeps coverage report stable when toggling metrics under coverage=measure', async () => {
    const baseOptions = {
      coverage: {
        mode: 'measure' as const,
        dimensionsEnabled: ['structure', 'branches'] as CoverageDimension[],
        excludeUnreachable: false,
      },
      generate: { count: 2, seed: 17 },
      validate: { validateFormats: false },
    };

    const withMetrics = await executePipeline(schema, {
      ...baseOptions,
      metrics: { enabled: true, verbosity: 'ci' },
    });
    const withoutMetrics = await executePipeline(schema, {
      ...baseOptions,
      metrics: { enabled: false, verbosity: 'ci' },
    });

    const viewOn = normalizePipelineResultForDeterminism(withMetrics, {
      includeMetrics: false,
    });
    const viewOff = normalizePipelineResultForDeterminism(withoutMetrics, {
      includeMetrics: false,
    });
    expect(viewOn).toStrictEqual(viewOff);

    const reportOn = normalizeCoverageReport(
      withMetrics.artifacts.coverageReport
    );
    const reportOff = normalizeCoverageReport(
      withoutMetrics.artifacts.coverageReport
    );

    expect(reportOn).toBeDefined();
    expect(reportOff).toBeDefined();
    expect(reportOn).toStrictEqual(reportOff);
    expect(withMetrics.artifacts.coverageReport?.run.metricsEnabled).toBe(true);
    expect(withoutMetrics.artifacts.coverageReport?.run.metricsEnabled).toBe(
      false
    );
    expect(withMetrics.metricsEnabled).toBe(true);
    expect(withoutMetrics.metricsEnabled).toBe(false);
  });

  it('respects planOptions.metrics when metrics options are not provided explicitly', async () => {
    const result = await executePipeline(schema, {
      generate: { count: 2, seed: 19, planOptions: { metrics: false } },
      validate: { validateFormats: false },
    });

    expect(result.metricsEnabled).toBe(false);
    expect(result.metrics.normalizeMs).toBe(0);
    expect(result.metrics.validationsPerRow).toBe(0);
  });
});
