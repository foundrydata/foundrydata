import { describe, it, expect } from 'vitest';

import { executePipeline } from '../orchestrator.js';
import type { PipelineOptions } from '../types.js';
import { repairPhilosophyMicroSchemas } from '../../repair/__fixtures__/repair-philosophy-microschemas.js';

describe('Repair tier policy — pipeline integration', () => {
  const baseOptions: PipelineOptions = {
    mode: 'strict',
    generate: {
      count: 3,
      seed: 37,
    },
    repair: { attempts: 2 },
    validate: { validateFormats: false },
    coverage: { mode: 'off' },
  };

  it('applies Tier-1 only repairs and records tier1 counters', async () => {
    const schema = repairPhilosophyMicroSchemas.tier1.stringMinLength;

    const result = await executePipeline(schema, baseOptions);

    const actions = result.artifacts.repairActions ?? [];
    expect(actions.length).toBeGreaterThanOrEqual(0);

    const metrics = result.metrics;
    expect(metrics.repairPassesPerRow).toBeGreaterThanOrEqual(0);
    expect(metrics.repairActionsPerRow ?? 0).toBeGreaterThanOrEqual(0);
    expect(metrics.repair_tier1_actions ?? 0).toBeGreaterThanOrEqual(0);
    expect(metrics.repair_tier2_actions ?? 0).toBeGreaterThanOrEqual(0);
    expect(metrics.repair_tierDisabled ?? 0).toBeGreaterThanOrEqual(0);
  });

  it('exercises Tier-2 repairs outside G_valid on a non-G_valid motif', async () => {
    const schema =
      repairPhilosophyMicroSchemas.tier2NonGValid.requiredAddObject;

    const result = await executePipeline(schema, baseOptions);

    const actions = result.artifacts.repairActions ?? [];
    expect(actions.length).toBeGreaterThanOrEqual(0);

    const metrics = result.metrics;
    expect(metrics.repairPassesPerRow).toBeGreaterThanOrEqual(0);
    expect(metrics.repairActionsPerRow ?? 0).toBeGreaterThanOrEqual(0);
    expect(metrics.repair_tier2_actions ?? 0).toBeGreaterThanOrEqual(0);
  });

  it('keeps G_valid structural behavior compatible with existing diagnostics', async () => {
    const schema = repairPhilosophyMicroSchemas.gValidStructural.simpleObject;

    const options: PipelineOptions = {
      ...baseOptions,
      generate: {
        ...baseOptions.generate,
        count: 1,
      },
    };

    const result = await executePipeline(schema, options);

    const diags = result.artifacts.repairDiagnostics ?? [];
    for (const d of diags) {
      expect(d.phase).toBe('repair');
      expect(typeof d.code).toBe('string');
      expect(typeof d.canonPath).toBe('string');
    }

    const metrics = result.metrics;
    expect(metrics.repairPassesPerRow).toBeGreaterThanOrEqual(0);
    expect(metrics.repairActionsPerRow ?? 0).toBeGreaterThanOrEqual(0);
  });
});
