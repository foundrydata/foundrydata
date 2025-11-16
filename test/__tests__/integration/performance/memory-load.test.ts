import { describe, expect, it } from 'vitest';

import { executePipeline, type PipelineOptions } from '@foundrydata/core';
import { BENCH_BUDGETS } from '../../../../packages/core/test/fixtures/bench-profiles.js';

const MEMORY_BUDGET_MB = BENCH_BUDGETS.memoryPeakMB;

function getHeapUsedMB(): number {
  const bytes = process.memoryUsage().heapUsed;
  return bytes / 1024 / 1024;
}

async function runPipelineIterations(iterations: number): Promise<{
  startMB: number;
  peakMB: number;
}> {
  const schema = {
    $id: 'https://example.com/memory-load',
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'integer' },
      name: { type: 'string' },
      tags: {
        type: 'array',
        items: { type: 'string' },
      },
      metadata: {
        type: 'object',
        additionalProperties: { type: 'string' },
      },
    },
    required: ['id', 'name'],
  } as const;

  const startMB = getHeapUsedMB();
  let peakMB = startMB;

  const maybeGc = (globalThis as any).gc as (() => void) | undefined;

  for (let index = 0; index < iterations; index += 1) {
    const options: PipelineOptions = {
      mode: 'strict',
      generate: {
        count: 3,
        seed: 37 + index,
      },
      validate: {
        validateFormats: false,
      },
    };

    const result = await executePipeline(schema, options);
    expect(result.status).toBe('completed');

    if (index % 10 === 0 && typeof maybeGc === 'function') {
      maybeGc();
    }

    const currentMB = getHeapUsedMB();
    if (currentMB > peakMB) {
      peakMB = currentMB;
    }
  }

  return { startMB, peakMB };
}

describe('memory-load', () => {
  it('keeps heap usage within the bench memory budget under load', async () => {
    const rawRuns = Number.parseInt(process.env.FC_NUM_RUNS ?? '', 10);
    const iterations =
      Number.isFinite(rawRuns) && rawRuns > 0 ? Math.min(rawRuns, 200) : 100;

    const { startMB, peakMB } = await runPipelineIterations(iterations);
    const deltaMB = peakMB - startMB;

    // Absolute cap aligned with bench budgets
    expect(peakMB).toBeLessThanOrEqual(MEMORY_BUDGET_MB);

    // Relative growth guardrail: avoid unbounded leak even below the cap
    expect(deltaMB).toBeLessThanOrEqual(MEMORY_BUDGET_MB / 2);
  }, 120_000);
});
