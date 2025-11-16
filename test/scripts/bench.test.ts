import { describe, expect, it } from 'vitest';
import {
  BENCH_BUDGETS,
  calculatePercentile,
  computeGateSummary,
  runProfile,
  type ProfileSummary,
  profiles,
} from '../../scripts/bench-core.js';

describe('bench harness utilities', () => {
  it('computes percentiles deterministically', () => {
    const samples = [4, 1, 9, 16, 25];
    expect(calculatePercentile(samples, 0)).toBe(1);
    expect(calculatePercentile(samples, 0.5)).toBe(9);
    expect(calculatePercentile(samples, 0.95)).toBe(25);
  });

  it('computes gate summary from profile results', () => {
    const summary: ProfileSummary[] = [
      {
        id: 'alpha',
        label: 'Alpha',
        warmupCount: 1,
        measuredCount: 2,
        p50LatencyMs: 10,
        p95LatencyMs: 12,
        memoryPeakMB: 128,
        runs: [],
      },
      {
        id: 'beta',
        label: 'Beta',
        warmupCount: 1,
        measuredCount: 2,
        p50LatencyMs: 55,
        p95LatencyMs: 80,
        memoryPeakMB: 256,
        runs: [],
      },
    ];

    const gate = computeGateSummary(summary);
    expect(gate.p95LatencyMs).toBe(80);
    expect(gate.memoryPeakMB).toBe(256);
    expect(gate.p95LatencyMs).toBeLessThanOrEqual(BENCH_BUDGETS.p95LatencyMs);
    expect(gate.memoryPeakMB).toBeLessThanOrEqual(BENCH_BUDGETS.memoryPeakMB);
  });
});

describe('bench harness runProfile', () => {
  it('executes a quick pass for the simple profile', async () => {
    const simple = profiles.find((entry) => entry.id === 'simple');
    expect(simple).toBeDefined();

    const summary = await runProfile(simple!, {
      iterations: { warmup: 0, measured: 1 },
      generateCount: 2,
      seeds: [1],
    });

    expect(summary.measuredCount).toBe(1);
    expect(summary.runs).toHaveLength(1);
    expect(summary.p50LatencyMs).toBeGreaterThan(0);
    expect(summary.p95LatencyMs).toBeGreaterThan(0);
    expect(summary.memoryPeakMB).toBeGreaterThan(0);
  }, 20_000);
});
