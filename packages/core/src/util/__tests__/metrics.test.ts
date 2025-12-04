import { describe, expect, it } from 'vitest';

import { MetricsCollector } from '../metrics';

describe('MetricsCollector', () => {
  it('tracks phase durations using injected clock', () => {
    let now = 0;
    const collector = new MetricsCollector({ now: () => now });
    expect(collector.isEnabled()).toBe(true);
    expect(collector.getVerbosity()).toBe('runtime');
    expect(collector.isVerbose()).toBe(false);

    collector.begin('NORMALIZE');
    now += 5;
    collector.end('NORMALIZE');

    collector.recordDuration('COMPOSE', 7);

    collector.begin('GENERATE');
    now += 3;
    collector.end('GENERATE');

    const snapshot = collector.snapshotMetrics({ verbosity: 'ci' });
    expect(snapshot.normalizeMs).toBeCloseTo(5);
    expect(snapshot.composeMs).toBeCloseTo(7);
    expect(snapshot.generateMs).toBeCloseTo(3);
    expect(snapshot.repairMs).toBe(0);
    expect(snapshot.validateMs).toBe(0);
  });

  it('increments counters and tracks repair metrics', () => {
    const collector = new MetricsCollector({ now: () => 0 });

    collector.addValidationCount(2);
    collector.addRepairPasses(1);
    collector.addRepairActions(4);
    collector.addRepairTierAction(1, 2);
    collector.addRepairTierAction(2, 3);
    collector.addRepairTierAction(3, 5);
    collector.addRepairTierDisabled(4);
    collector.addBranchTrial();
    collector.addBranchTrial();
    collector.addPatternWitnessTrial();
    collector.setCompileMs(11);
    collector.observeMemoryPeak(256);
    collector.observeMemoryPeak(128); // should keep the max value
    collector.setLatency(50, 42);
    collector.setLatency(95, 110);

    const snapshot = collector.snapshotMetrics({ verbosity: 'ci' });
    expect(snapshot.validationsPerRow).toBe(2);
    expect(snapshot.repairPassesPerRow).toBe(1);
    expect(snapshot.repairActionsPerRow).toBe(4);
    expect(snapshot.repair_tier1_actions).toBe(2);
    expect(snapshot.repair_tier2_actions).toBe(3);
    expect(snapshot.repair_tier3_actions).toBe(5);
    expect(snapshot.repair_tierDisabled).toBe(4);
    expect(snapshot.branchTrialsTried).toBe(2);
    expect(snapshot.patternWitnessTried).toBe(1);
    expect(snapshot.compileMs).toBe(11);
    expect(snapshot.memoryPeakMB).toBe(256);
    expect(snapshot.p50LatencyMs).toBe(42);
    expect(snapshot.p95LatencyMs).toBe(110);
  });

  it('applies verbosity toggle to optional observability payloads', () => {
    const collector = new MetricsCollector({ now: () => 0 });

    collector.trackBranchCoverage('/oneOf/0', [0, 2], 4);
    collector.trackEnumUsage('/properties/name', 'Alice');
    collector.trackEnumUsage('/properties/name', 'Bob');

    collector.setVerbosity('runtime');
    const runtimeSnapshot = collector.snapshotMetrics();
    expect(runtimeSnapshot.branchCoverageOneOf).toBeUndefined();
    expect(runtimeSnapshot.enumUsage).toBeUndefined();

    const ciSnapshot = collector.snapshotMetrics({ verbosity: 'ci' });
    expect(ciSnapshot.branchCoverageOneOf).toEqual({
      '/oneOf/0': { visited: [0, 2], total: 4 },
    });
    expect(ciSnapshot.enumUsage).toEqual({
      '/properties/name': { Alice: 1, Bob: 1 },
    });
    expect(collector.isVerbose({ verbosity: 'ci' })).toBe(true);
  });

  it('guards against double-start and end-before-start scenarios', () => {
    const collector = new MetricsCollector({ now: () => 0 });

    collector.begin('NORMALIZE');
    expect(() => collector.begin('NORMALIZE')).toThrow(/already started/);

    const lateCollector = new MetricsCollector({ now: () => 0 });
    expect(() => lateCollector.end('GENERATE')).toThrow(/was not started/);
  });

  it('skips collection when disabled', () => {
    let now = 0;
    const collector = new MetricsCollector({
      now: () => now,
      enabled: false,
      verbosity: 'ci',
    });

    expect(collector.isEnabled()).toBe(false);

    collector.begin('NORMALIZE');
    now += 10;
    collector.end('NORMALIZE');
    collector.addValidationCount(5);
    collector.addRepairTierAction(1, 1);
    collector.addRepairTierDisabled(1);
    collector.trackBranchCoverage('/oneOf/0', [1], 3);
    collector.trackEnumUsage('/properties/name', 'Alice');

    const snapshot = collector.snapshotMetrics();
    expect(snapshot.normalizeMs).toBe(0);
    expect(snapshot.validationsPerRow).toBe(0);
    expect(snapshot.repair_tier1_actions).toBe(0);
    expect(snapshot.repair_tierDisabled).toBe(0);
    expect(snapshot.branchCoverageOneOf).toBeUndefined();
    expect(snapshot.enumUsage).toBeUndefined();
  });

  it('exposes helper to inspect verbosity mode', () => {
    const collector = new MetricsCollector();
    expect(collector.isVerbose()).toBe(false);
    collector.setVerbosity('ci');
    expect(collector.getVerbosity()).toBe('ci');
    expect(collector.isVerbose()).toBe(true);
    expect(collector.isVerbose({ verbosity: 'runtime' })).toBe(false);
  });
});
