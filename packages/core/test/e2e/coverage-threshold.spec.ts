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
});
