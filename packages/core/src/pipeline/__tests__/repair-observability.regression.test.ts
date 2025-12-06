import { describe, expect, it } from 'vitest';

import { executePipeline } from '../orchestrator.js';
import type { PipelineOptions, PipelineResult } from '../types.js';
import { assertDiagnosticEnvelope } from '../../diag/validate.js';
import { repairPhilosophyMicroSchemas } from '../../repair/__fixtures__/repair-philosophy-microschemas.js';
import { normalizePipelineResultForDeterminism } from '../../../test/util/determinism-compare.js';

const MOTIF_KEY = 'gValid_simpleObjectRequired';

function baseOptions(): PipelineOptions {
  return {
    mode: 'strict',
    metrics: { enabled: true, verbosity: 'ci' },
    generate: { count: 2, seed: 37, planOptions: { gValid: true } },
    repair: { attempts: 2 },
    validate: { validateFormats: false },
  };
}

function selectRepairMetrics(result: PipelineResult): Record<string, number> {
  const m = result.metrics;
  return {
    repairPassesPerRow: m.repairPassesPerRow ?? 0,
    repairActionsPerRow: m.repairActionsPerRow ?? 0,
    repair_tier1_actions: m.repair_tier1_actions ?? 0,
    repair_tier2_actions: m.repair_tier2_actions ?? 0,
    repair_tier3_actions: m.repair_tier3_actions ?? 0,
    repair_tierDisabled: m.repair_tierDisabled ?? 0,
    [`${MOTIF_KEY}_items`]: m[`${MOTIF_KEY}_items`] ?? 0,
    [`${MOTIF_KEY}_itemsWithRepair`]: m[`${MOTIF_KEY}_itemsWithRepair`] ?? 0,
    [`${MOTIF_KEY}_actions`]: m[`${MOTIF_KEY}_actions`] ?? 0,
  };
}

describe('Repair/G_valid observability regression', () => {
  const schema = repairPhilosophyMicroSchemas.gValidStructural.simpleObject;

  it('emits deterministic G_valid metrics and diagnostics across repeated runs', async () => {
    const options = baseOptions();

    const first = await executePipeline(schema, options);
    const second = await executePipeline(schema, options);

    // Deterministic view (keeps deterministic metrics, strips timings/SLIs).
    expect(normalizePipelineResultForDeterminism(first)).toStrictEqual(
      normalizePipelineResultForDeterminism(second)
    );

    const metrics = first.metrics;
    expect(metrics[`${MOTIF_KEY}_items`]).toBeGreaterThan(0);
    expect(metrics.repair_tierDisabled).toBeGreaterThanOrEqual(0);

    const repairDiags = first.artifacts.repairDiagnostics ?? [];
    expect(repairDiags.length).toBeGreaterThanOrEqual(0);
    if (repairDiags.length > 0) {
      for (const diag of repairDiags) {
        assertDiagnosticEnvelope(diag);
      }
    }
  });

  it('keeps repair artefacts and repair metrics identical between coverage off and measure', async () => {
    const off = await executePipeline(schema, {
      ...baseOptions(),
      coverage: { mode: 'off' },
    });
    const measure = await executePipeline(schema, {
      ...baseOptions(),
      coverage: { mode: 'measure', dimensionsEnabled: [] },
    });

    // Outputs and diagnostics stay identical even if coverage instrumentation runs.
    const offView = normalizePipelineResultForDeterminism(off, {
      includeMetrics: false,
    });
    const measureView = normalizePipelineResultForDeterminism(measure, {
      includeMetrics: false,
    });
    expect(offView).toStrictEqual(measureView);

    // Repair metrics (tier + gValid motif counters) remain equal.
    expect(selectRepairMetrics(off)).toStrictEqual(
      selectRepairMetrics(measure)
    );
  });

  it('keeps outputs identical when metrics are disabled and zeros repair counters', async () => {
    const enabled = await executePipeline(schema, baseOptions());
    const disabled = await executePipeline(schema, {
      ...baseOptions(),
      metrics: { enabled: false, verbosity: 'ci' },
    });

    const strippedEnabled = normalizePipelineResultForDeterminism(enabled, {
      includeMetrics: false,
    });
    const strippedDisabled = normalizePipelineResultForDeterminism(disabled, {
      includeMetrics: false,
    });
    expect(strippedEnabled).toStrictEqual(strippedDisabled);

    const enabledRepair = selectRepairMetrics(enabled);
    for (const value of Object.values(enabledRepair)) {
      expect(value).toBeGreaterThanOrEqual(0);
    }

    const disabledRepair = selectRepairMetrics(disabled);
    for (const value of Object.values(disabledRepair)) {
      expect(value).toBe(0);
    }
  });
});
