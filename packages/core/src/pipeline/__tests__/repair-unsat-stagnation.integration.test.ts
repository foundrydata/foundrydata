/* eslint-disable complexity */
import { describe, it, expect } from 'vitest';

import { executePipeline } from '../orchestrator.js';
import type { PipelineOptions } from '../types.js';
import { repairPhilosophyMicroSchemas } from '../../repair/__fixtures__/repair-philosophy-microschemas.js';

describe('Repair UNSAT/stagnation — pipeline integration', () => {
  const baseOptions: PipelineOptions = {
    mode: 'strict',
    generate: {
      count: 1,
      seed: 11,
    },
    repair: {
      attempts: 2,
    },
    validate: { validateFormats: false },
    coverage: { mode: 'off' },
  };

  interface UnsatRunSnapshot {
    repaired: unknown[] | undefined;
    actions: unknown[] | undefined;
    diags: unknown[] | undefined;
    metrics: {
      repairPassesPerRow: number;
      repairActionsPerRow?: number;
      repair_tier1_actions?: number;
      repair_tier2_actions?: number;
      repair_tier3_actions?: number;
      repair_tierDisabled?: number;
    };
    status: string;
    timeline: string[];
  }

  async function runUnsatPipeline(schema: unknown): Promise<UnsatRunSnapshot> {
    const result = await executePipeline(schema, baseOptions);
    return {
      repaired: result.artifacts.repaired,
      actions: result.artifacts.repairActions,
      diags: result.artifacts.repairDiagnostics,
      metrics: result.metrics,
      status: result.status,
      timeline: result.timeline,
    };
  }

  it('is deterministic for UNSAT-like schema', async () => {
    const schema = repairPhilosophyMicroSchemas.unsat.integerConstVsMultipleOf;

    const first = await runUnsatPipeline(schema);
    const second = await runUnsatPipeline(schema);

    expect(second.status).toBe(first.status);
    expect(second.timeline).toEqual(first.timeline);

    expect(second.repaired).toEqual(first.repaired);
    expect(second.actions).toEqual(first.actions);
    expect(second.diags).toEqual(first.diags);
  });

  it('keeps repair metrics stable for UNSAT-like schema', async () => {
    const schema = repairPhilosophyMicroSchemas.unsat.integerConstVsMultipleOf;

    const first = await runUnsatPipeline(schema);
    const second = await runUnsatPipeline(schema);

    const m1 = first.metrics;
    const m2 = second.metrics;

    expect(m2.repairPassesPerRow).toBe(m1.repairPassesPerRow);
    expect(m2.repairActionsPerRow ?? 0).toBe(m1.repairActionsPerRow ?? 0);
    expect(m2.repair_tier1_actions ?? 0).toBe(m1.repair_tier1_actions ?? 0);
    expect(m2.repair_tier2_actions ?? 0).toBe(m1.repair_tier2_actions ?? 0);
    expect(m2.repair_tier3_actions ?? 0).toBe(m1.repair_tier3_actions ?? 0);
    expect(m2.repair_tierDisabled ?? 0).toBe(m1.repair_tierDisabled ?? 0);
  });
});
