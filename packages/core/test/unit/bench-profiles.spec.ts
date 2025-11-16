import { describe, expect, it } from 'vitest';

import { executePipeline } from '../../src/pipeline/orchestrator.js';
import {
  BENCH_SEEDS,
  benchProfileFixtures,
} from '../fixtures/bench-profiles.js';
import { runPipelineStages } from './test-helpers.js';

describe('bench profile fixtures', () => {
  it('compose and generate deterministic samples for every profile', () => {
    for (const fixture of benchProfileFixtures) {
      const { generate } = runPipelineStages(fixture.schema, {
        generate: { seed: BENCH_SEEDS[0], count: fixture.sampleSize },
      });
      expect(generate.items).toHaveLength(fixture.sampleSize);
      expect(Array.isArray(generate.diagnostics)).toBe(true);
    }
  });

  it('stay within published metrics budgets for a reference seed', async () => {
    for (const fixture of benchProfileFixtures) {
      const result = await executePipeline(fixture.schema, {
        metrics: { verbosity: 'ci', enabled: true },
        snapshotVerbosity: 'ci',
        generate: {
          seed: BENCH_SEEDS[1],
          count: fixture.sampleSize,
        },
      });

      expect(result.status).toBe('completed');
      const metrics = result.metrics;
      const budget = fixture.metricsBudget;
      if (budget?.validationsPerRowP50 !== undefined) {
        const perRowValidations =
          metrics.validationsPerRow / fixture.sampleSize;
        expect(perRowValidations).toBeLessThanOrEqual(
          budget.validationsPerRowP50
        );
      }
      if (budget?.repairPassesPerRowP50 !== undefined) {
        const perRowRepairs = metrics.repairPassesPerRow / fixture.sampleSize;
        expect(perRowRepairs).toBeLessThanOrEqual(budget.repairPassesPerRowP50);
      }
    }
  });
});
