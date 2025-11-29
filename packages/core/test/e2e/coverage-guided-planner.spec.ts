import { describe, it, expect } from 'vitest';

import { generateFromCompose } from '../../src/generator/foundry-generator.js';
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

  it('shows Repair-side unsatisfied hints in coverageReport.unsatisfiedHints', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        keep: { const: 'ok' },
      },
      required: ['keep'],
    } as const;

    const options = {
      mode: 'strict' as const,
      coverage: {
        mode: 'guided' as const,
        dimensionsEnabled: ['structure'] as const,
        planner: {
          dimensionPriority: ['structure'] as const,
        },
      },
      generate: {
        count: 100,
        seed: 31415,
      },
      validate: {
        validateFormats: false,
      },
    } as const;

    const result = await executePipeline(schema, options, {
      generate(effective, opts, coverage) {
        const output = generateFromCompose(effective, {
          ...(opts ?? {}),
          coverage,
        });
        if (
          coverage &&
          coverage.mode === 'guided' &&
          coverage.hintTrace &&
          typeof coverage.hintTrace.recordApplication === 'function'
        ) {
          const firstItem = output.items[0];
          if (firstItem && typeof firstItem === 'object') {
            (firstItem as Record<string, unknown>).drop = 'blocked';
          }
          coverage.hintTrace.recordApplication({
            hint: {
              kind: 'ensurePropertyPresence',
              canonPath: '#',
              params: { propertyName: 'drop', present: true },
            },
            canonPath: '#',
            instancePath: '',
            itemIndex: 0,
          });
        }
        return output;
      },
    });

    expect(result.status).toBe('completed');

    const report = result.artifacts.coverageReport;
    expect(report).toBeDefined();
    const unsatisfied = report?.unsatisfiedHints ?? [];

    const repairHints = unsatisfied.filter(
      (hint) =>
        hint.kind === 'ensurePropertyPresence' &&
        hint.canonPath === '#' &&
        (hint.params as { propertyName?: unknown })?.propertyName === 'drop' &&
        hint.reasonCode === 'REPAIR_MODIFIED_VALUE'
    );

    expect(repairHints.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps reused definition ensurePropertyPresence hints from being flagged as REPAIR_MODIFIED_VALUE', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $defs: {
        shared: {
          type: 'object',
          additionalProperties: false,
          properties: {
            guarded: { const: 'ok' },
          },
        },
      },
      type: 'object',
      properties: {
        entry: { $ref: '#/$defs/shared' },
      },
    } as const;

    const options = {
      mode: 'strict' as const,
      coverage: {
        mode: 'guided' as const,
        dimensionsEnabled: ['structure'] as const,
        hints: [
          {
            kind: 'ensurePropertyPresence',
            canonPath: '#/$defs/shared/properties/guarded',
            params: { propertyName: 'guarded', present: true },
          },
        ],
      },
      generate: {
        count: 1,
        seed: 4242,
      },
      validate: {
        validateFormats: false,
      },
    } as const;

    const result = await executePipeline(schema, options);
    expect(result.status).toBe('completed');

    const unsatisfied = result.artifacts.coverageReport?.unsatisfiedHints ?? [];
    const falsePositives = unsatisfied.filter(
      (hint) =>
        hint.kind === 'ensurePropertyPresence' &&
        hint.canonPath === '#/$defs/shared/properties/guarded' &&
        hint.reasonCode === 'REPAIR_MODIFIED_VALUE'
    );

    expect(falsePositives).toHaveLength(0);
  });
});
