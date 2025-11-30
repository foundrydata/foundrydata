import { describe, expect, it } from 'vitest';

import { executePipeline } from '../../src/pipeline/orchestrator.js';

const coverageThresholdSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  oneOf: [
    {
      type: 'object',
      properties: {
        flavor: { const: 'vanilla' },
      },
      required: ['flavor'],
    },
    {
      type: 'object',
      properties: {
        flavor: { const: 'chocolate' },
      },
      required: ['flavor'],
    },
  ],
} as const;

describe('coverage threshold end-to-end enforcement', () => {
  it('returns a CoverageReport with coverageStatus minCoverageNotMet and thresholds.overall', async () => {
    const pipelineResult = await executePipeline(coverageThresholdSchema, {
      generate: { count: 2, seed: 2025 },
      validate: { validateFormats: false },
      coverage: {
        mode: 'measure',
        dimensionsEnabled: ['structure', 'branches'],
        minCoverage: 0.8,
      },
    });

    expect(pipelineResult.status).toBe('completed');
    const coverageReport = pipelineResult.artifacts.coverageReport;
    expect(coverageReport).toBeDefined();

    expect(coverageReport?.metrics.coverageStatus).toBe('minCoverageNotMet');
    expect(coverageReport?.metrics.thresholds?.overall).toBe(0.8);
    expect(coverageReport?.metrics.overall ?? 1).toBeLessThan(0.8);
    expect(
      coverageReport?.metrics.targetsByStatus.active
    ).toBeGreaterThanOrEqual(2);
  });

  it('exposes uncoveredTargets consistent with metrics when minCoverage is not met', async () => {
    const options = {
      generate: { count: 2, seed: 2025 },
      validate: { validateFormats: false },
      coverage: {
        mode: 'measure' as const,
        dimensionsEnabled: ['structure', 'branches'] as const,
        minCoverage: 0.8,
      },
    } as const;

    const first = await executePipeline(coverageThresholdSchema, options);
    const second = await executePipeline(coverageThresholdSchema, options);

    expect(first.status).toBe('completed');
    expect(second.status).toBe('completed');

    const firstReport = first.artifacts.coverageReport;
    const secondReport = second.artifacts.coverageReport;

    expect(firstReport).toBeDefined();
    expect(secondReport).toBeDefined();

    const firstMetrics = firstReport!.metrics;
    const secondMetrics = secondReport!.metrics;

    expect(firstMetrics.coverageStatus).toBe('minCoverageNotMet');
    expect(secondMetrics.coverageStatus).toBe('minCoverageNotMet');

    expect(firstMetrics.thresholds?.overall).toBe(0.8);
    expect(secondMetrics.thresholds?.overall).toBe(0.8);

    expect(firstMetrics.overall).toBeLessThan(0.8);
    expect(secondMetrics.overall).toBeLessThan(0.8);

    const firstUncovered = firstReport!.uncoveredTargets ?? [];
    const secondUncovered = secondReport!.uncoveredTargets ?? [];

    expect(firstUncovered.length).toBeGreaterThan(0);
    expect(secondUncovered.length).toBeGreaterThan(0);

    // The set of uncovered target IDs should be deterministic for fixed schema,
    // options and seed, and consistent with metrics/thresholds.
    const firstIds = new Set(firstUncovered.map((t) => t.id));
    const secondIds = new Set(secondUncovered.map((t) => t.id));
    expect(firstIds).toEqual(secondIds);
  });
});
