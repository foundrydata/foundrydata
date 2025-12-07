import { describe, expect, it } from 'vitest';

import { normalizePipelineResultForDeterminism } from './determinism-compare.js';
import type { PipelineResult } from '../../src/pipeline/types.js';

describe('normalizePipelineResultForDeterminism', () => {
  it('drops non-deterministic metrics while keeping deterministic counters', () => {
    const result: PipelineResult = {
      status: 'completed',
      schema: {},
      stages: {
        normalize: { status: 'completed' },
        compose: { status: 'completed' },
        generate: { status: 'completed' },
        repair: { status: 'completed' },
        validate: { status: 'completed' },
      },
      metrics: {
        normalizeMs: 1,
        composeMs: 2,
        generateMs: 3,
        repairMs: 4,
        validateMs: 5,
        compileMs: 6,
        validationsPerRow: 1,
        repairPassesPerRow: 1,
        repairActionsPerRow: 1,
        branchTrialsTried: 1,
        patternWitnessTried: 1,
        evalTraceChecks: 1,
        evalTraceProved: 1,
        memoryPeakMB: 10,
        p50LatencyMs: 20,
        p95LatencyMs: 30,
        repair_tier1_actions: 0,
        repair_tier2_actions: 0,
        repair_tier3_actions: 0,
        repair_tierDisabled: 0,
        nameBfsNodesExpanded: 0,
        nameBfsQueuePeak: 0,
        nameEnumResults: 0,
        nameEnumElapsedMs: 123,
      },
      metricsEnabled: true,
      timeline: [],
      errors: [],
      artifacts: {
        generated: { items: [], diagnostics: [], metrics: {}, seed: 0 },
        repaired: [],
        repairActions: [],
        validationDiagnostics: [],
        repairDiagnostics: [],
      },
    };

    const normalized = normalizePipelineResultForDeterminism(result);

    expect(normalized.metrics?.branchTrialsTried).toBe(1);
    expect(normalized.metrics?.nameEnumElapsedMs).toBeUndefined();
    expect(normalized.metrics?.normalizeMs).toBeUndefined();
  });
});
