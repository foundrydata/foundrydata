import { describe, it, expect } from 'vitest';

import { executePipeline } from '../orchestrator.js';
import type { PipelineOptions, PipelineResult } from '../types.js';

describe('Repair determinism — pre-repair fixture path', () => {
  async function buildPreRepairFixture(
    schema: unknown,
    options: PipelineOptions
  ): Promise<{ items: unknown[]; seed: number }> {
    const baseline = await executePipeline(schema, options);
    const generated = baseline.stages.generate.output;
    expect(generated).toBeDefined();
    const items = Array.isArray(generated?.items) ? generated.items : [];
    expect(items.length).toBeGreaterThan(0);

    return { items, seed: generated!.seed };
  }

  async function runRepairWithFixture(
    schema: unknown,
    options: PipelineOptions,
    fixture: { items: unknown[]; seed: number }
  ): Promise<PipelineResult> {
    return executePipeline(schema, options, {
      generate: async () => ({
        items: fixture.items,
        diagnostics: [],
        metrics: {},
        seed: fixture.seed,
      }),
    });
  }

  it('reuses pre-repair items fixture and remains deterministic across runs', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { enum: ['alpha', 'beta'] },
        alphaPayload: { type: 'string', minLength: 1 },
        betaPayload: { type: 'string', minLength: 1 },
      },
      required: ['kind'],
      allOf: [
        {
          if: {
            properties: { kind: { const: 'alpha' } },
            required: ['kind'],
          },
          then: {
            required: ['alphaPayload'],
          },
          else: {
            required: ['betaPayload'],
          },
        },
      ],
    } as const;

    const baseOptions: PipelineOptions = {
      mode: 'strict',
      generate: {
        count: 5,
        seed: 37,
      },
      repair: { attempts: 2 },
      validate: { validateFormats: false },
      coverage: { mode: 'off' },
    };

    const fixture = await buildPreRepairFixture(schema, baseOptions);

    const first = await runRepairWithFixture(schema, baseOptions, fixture);
    const second = await runRepairWithFixture(schema, baseOptions, fixture);

    expect(second.status).toBe(first.status);

    expect(first.artifacts.repaired).toEqual(second.artifacts.repaired);
    expect(first.artifacts.repairActions).toEqual(
      second.artifacts.repairActions
    );
    expect(first.artifacts.repairDiagnostics).toEqual(
      second.artifacts.repairDiagnostics
    );

    const m1 = first.metrics;
    const m2 = second.metrics;

    expect(m1.repairPassesPerRow).toBe(m2.repairPassesPerRow);
    expect(m1.repairActionsPerRow).toBe(m2.repairActionsPerRow);
    expect(m1.repair_tier1_actions).toBe(m2.repair_tier1_actions);
    expect(m1.repair_tier2_actions).toBe(m2.repair_tier2_actions);
    expect(m1.repair_tier3_actions).toBe(m2.repair_tier3_actions);
    expect(m1.repair_tierDisabled).toBe(m2.repair_tierDisabled);
  });
});
