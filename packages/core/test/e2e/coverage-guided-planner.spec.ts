import { describe, it, expect } from 'vitest';

import { executePipeline } from '../../src/pipeline/orchestrator.js';

const schemaWithOneOfAndEnum = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { const: 'left' },
        tag: { enum: ['A', 'B'] },
      },
      required: ['kind', 'tag'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { const: 'right' },
        tag: { enum: ['A', 'B'] },
      },
      required: ['kind', 'tag'],
    },
  ],
} as const;

describe('coverage=guided planning behavior', () => {
  it('reaches at least as much branch and enum coverage as coverage=measure', async () => {
    const baseOptions = {
      mode: 'strict' as const,
      coverage: {
        mode: 'measure' as const,
        dimensionsEnabled: ['branches', 'enum'] as const,
      },
      generate: {
        count: 8,
        seed: 37,
      },
      validate: {
        validateFormats: false,
      },
    };

    const measureResult = await executePipeline(schemaWithOneOfAndEnum, {
      ...baseOptions,
      coverage: {
        ...baseOptions.coverage,
        mode: 'measure',
      },
    });

    const guidedResult = await executePipeline(schemaWithOneOfAndEnum, {
      ...baseOptions,
      coverage: {
        ...baseOptions.coverage,
        mode: 'guided',
      },
    });

    const measureMetrics = measureResult.artifacts.coverageMetrics;
    const guidedMetrics = guidedResult.artifacts.coverageMetrics;

    expect(measureMetrics).toBeDefined();
    expect(guidedMetrics).toBeDefined();

    const measureBranches = measureMetrics?.byDimension['branches'] ?? 0;
    const guidedBranches = guidedMetrics?.byDimension['branches'] ?? 0;
    const measureEnum = measureMetrics?.byDimension['enum'] ?? 0;
    const guidedEnum = guidedMetrics?.byDimension['enum'] ?? 0;

    expect(guidedBranches).toBeGreaterThanOrEqual(measureBranches);
    expect(guidedEnum).toBeGreaterThanOrEqual(measureEnum);
  });
});
