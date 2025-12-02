import { describe, it, expect } from 'vitest';

import { executePipeline } from '../../src/pipeline/orchestrator.js';
import type { CoverageDimension } from '@foundrydata/shared';
import { generateCoverageSchemas } from './coverage-schema-generator.js';

function getCoverageByDimension(
  result: Awaited<ReturnType<typeof executePipeline>>
): Record<string, number> {
  const metrics = result.artifacts.coverageMetrics;
  return metrics?.byDimension ?? {};
}

describe('Property-based coverage invariants (off / measure / guided)', () => {
  it('respects determinism off vs measure and non-regression guided >= measure on small schema zoo', async () => {
    for (const testCase of generateCoverageSchemas()) {
      const { id, schema, dimensions } = testCase;

      const baseOptions = {
        mode: 'strict' as const,
        generate: { count: 24, seed: 1337 },
        validate: { validateFormats: false },
      } as const;

      const offResult = await executePipeline(schema, {
        ...baseOptions,
        coverage: { mode: 'off' },
      });

      const measureResult = await executePipeline(schema, {
        ...baseOptions,
        coverage: {
          mode: 'measure',
          dimensionsEnabled: dimensions as CoverageDimension[],
        },
      });

      const guidedResult = await executePipeline(schema, {
        ...baseOptions,
        coverage: {
          mode: 'guided',
          dimensionsEnabled: dimensions as CoverageDimension[],
        },
      });

      expect(offResult.status).toBe(measureResult.status);
      expect(guidedResult.status).toBe(measureResult.status);

      // Invariant 1: coverage=measure is a pure observation layer on items.
      if (measureResult.status === 'completed') {
        const offItems =
          offResult.artifacts.repaired ?? offResult.artifacts.generated?.items;
        const measureItems =
          measureResult.artifacts.repaired ??
          measureResult.artifacts.generated?.items;
        expect(measureItems).toEqual(offItems);
      }

      // Invariant 2: guided must not regress on enabled dimensions.
      const measureDims = getCoverageByDimension(measureResult);
      const guidedDims = getCoverageByDimension(guidedResult);

      for (const dim of dimensions) {
        const m = measureDims[dim] ?? 0;
        const g = guidedDims[dim] ?? 0;
        expect(g).toBeGreaterThanOrEqual(m);
      }
    }
  });
});
