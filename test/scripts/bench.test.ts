import { describe, expect, it } from 'vitest';
import {
  BENCH_BUDGETS,
  calculatePercentile,
  computeGateSummary,
  formatProfilePhaseSummary,
  runProfile,
  type ProfileSummary,
  profiles,
} from '../../scripts/bench-core.js';
import type { MetricsSnapshot } from '../../packages/core/src/index.js';

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

  it('formats phase breakdown when metrics are available', () => {
    const metrics: MetricsSnapshot = {
      normalizeMs: 5,
      composeMs: 10,
      generateMs: 15,
      repairMs: 0,
      validateMs: 2,
      compileMs: 0,
      validationsPerRow: 0,
      repairPassesPerRow: 0,
      memoryPeakMB: 64,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      evalTraceChecks: 0,
      evalTraceProved: 0,
      nameBfsNodesExpanded: 0,
      nameBfsQueuePeak: 0,
      nameBeamWidthPeak: 0,
      nameEnumResults: 0,
      nameEnumElapsedMs: 0,
      patternPropsHit: 0,
      presencePressureResolved: 0,
    };

    const summary: ProfileSummary = {
      id: 'alpha',
      label: 'Alpha',
      warmupCount: 0,
      measuredCount: 1,
      p50LatencyMs: 5,
      p95LatencyMs: 5,
      memoryPeakMB: 64,
      runs: [
        {
          seed: 1,
          latencyMs: 5,
          memoryPeakMB: 64,
          metrics,
        },
      ],
    };

    const formatted = formatProfilePhaseSummary(summary);
    expect(formatted).toBeDefined();
    expect(formatted).toContain('normalize=');
    expect(formatted).toContain('compose=');
    expect(formatted).toContain('generate=');
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

  it('can run a simple profile with coverage=measure within bench budgets', async () => {
    const simple = profiles.find((entry) => entry.id === 'simple');
    expect(simple).toBeDefined();

    const summary = await runProfile(simple!, {
      iterations: { warmup: 0, measured: 1 },
      generateCount: 2,
      seeds: [1],
      pipelineOverrides: {
        coverage: {
          mode: 'measure',
          dimensionsEnabled: ['structure', 'branches'],
          excludeUnreachable: false,
        },
        validate: { validateFormats: false },
      },
    });

    expect(summary.measuredCount).toBe(1);
    expect(summary.runs).toHaveLength(1);
    expect(summary.p95LatencyMs).toBeGreaterThan(0);
    expect(summary.memoryPeakMB).toBeGreaterThan(0);
    expect(summary.p95LatencyMs).toBeLessThanOrEqual(
      BENCH_BUDGETS.p95LatencyMs
    );
    expect(summary.memoryPeakMB).toBeLessThanOrEqual(
      BENCH_BUDGETS.memoryPeakMB
    );
  }, 20_000);
});
