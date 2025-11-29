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

  // eslint-disable-next-line complexity
  it('wires planner-produced hints into generator in coverage=guided mode', async () => {
    const baseOptions = {
      mode: 'strict' as const,
      coverage: {
        mode: 'guided' as const,
        dimensionsEnabled: ['branches', 'enum'] as const,
      },
      generate: {
        count: 6,
        seed: 123,
      },
      validate: {
        validateFormats: false,
      },
    } as const;

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

    expect(measureResult.status).toBe('completed');
    expect(guidedResult.status).toBe('completed');

    const measureMetrics = measureResult.artifacts.coverageMetrics;
    const guidedMetrics = guidedResult.artifacts.coverageMetrics;

    expect(measureMetrics).toBeDefined();
    expect(guidedMetrics).toBeDefined();

    const measureBranches = measureMetrics?.byDimension['branches'] ?? 0;
    const guidedBranches = guidedMetrics?.byDimension['branches'] ?? 0;
    const measureEnum = measureMetrics?.byDimension['enum'] ?? 0;
    const guidedEnum = guidedMetrics?.byDimension['enum'] ?? 0;

    // Guided mode should not regress coverage and should typically
    // improve enum coverage for this schema under the same budget.
    expect(guidedBranches).toBeGreaterThanOrEqual(measureBranches);
    expect(guidedEnum).toBeGreaterThanOrEqual(measureEnum);

    // Determinism check: repeated guided runs with the same options
    // produce identical coverage metrics and targets.
    const guidedRepeat = await executePipeline(schemaWithOneOfAndEnum, {
      ...baseOptions,
      coverage: {
        ...baseOptions.coverage,
        mode: 'guided',
      },
    });
    const guidedMetricsRepeat = guidedRepeat.artifacts.coverageMetrics;
    expect(guidedMetricsRepeat).toBeDefined();
    expect(guidedMetricsRepeat?.overall).toBe(guidedMetrics?.overall);
    expect(guidedMetricsRepeat?.byDimension['branches']).toBe(
      guidedMetrics?.byDimension['branches']
    );
    expect(guidedMetricsRepeat?.byDimension['enum']).toBe(
      guidedMetrics?.byDimension['enum']
    );
  });
});
