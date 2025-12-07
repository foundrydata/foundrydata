/* eslint-disable complexity */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CoverageReport, DiagMetrics } from '@foundrydata/shared';
import { describe, expect, it } from 'vitest';

import { buildReporterPlatformView } from '../index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COVERAGE_FIXTURE_PATH = resolve(
  __dirname,
  '../../../test/fixtures/coverage-report.v1.sample.json'
);

function baseMetrics(overrides: Partial<DiagMetrics> = {}): DiagMetrics {
  return {
    normalizeMs: 1,
    composeMs: 1,
    generateMs: 1,
    repairMs: 1,
    validateMs: 1,
    compileMs: 0,
    validationsPerRow: 1,
    repairPassesPerRow: 1,
    repairActionsPerRow: 1,
    branchTrialsTried: 0,
    patternWitnessTried: 0,
    evalTraceChecks: 0,
    evalTraceProved: 0,
    memoryPeakMB: 0,
    p50LatencyMs: 0,
    p95LatencyMs: 0,
    repair_tier1_actions: 0,
    repair_tier2_actions: 0,
    repair_tier3_actions: 0,
    repair_tierDisabled: 0,
    ...overrides,
  };
}

describe('buildReporterPlatformView', () => {
  it('derives platform view with repair usage invariants and coverage planning', () => {
    const raw = JSON.parse(
      readFileSync(COVERAGE_FIXTURE_PATH, 'utf8')
    ) as CoverageReport;
    const coverage: CoverageReport = {
      ...raw,
      engine: { ...raw.engine, coverageMode: 'guided' },
      run: {
        ...raw.run,
        metricsEnabled: true,
        operationsScope: 'selected',
        selectedOperations: ['POST /users', 'GET /users', 'GET /users'],
      },
      diagnostics: {
        ...raw.diagnostics,
        plannerCapsHit: [
          ...raw.diagnostics.plannerCapsHit,
          {
            dimension: 'branches',
            scopeType: 'operation',
            scopeKey: 'GET /users',
            totalTargets: 2,
            plannedTargets: 1,
            unplannedTargets: 1,
          },
        ],
      },
    };

    const metrics = baseMetrics({
      repairUsageByMotif: [
        {
          motifId: 'zeta',
          gValid: false,
          items: 1,
          itemsWithRepair: 1,
          actions: 0,
        },
        {
          motifId: 'alpha',
          gValid: true,
          items: 2,
          itemsWithRepair: 1,
          actions: 3,
        },
      ],
    });

    const view = buildReporterPlatformView({
      metrics,
      coverageReport: coverage,
      seed: 123,
      metricsEnabled: true,
    });

    expect(view.version).toBe('reporter-platform-view/v1');
    expect(view.engine.name).toBe('foundrydata');
    expect(view.engine.version).toBe(coverage.engine.foundryVersion);
    expect(view.run.registryFingerprint).toBe(coverage.run.registryFingerprint);
    expect(view.run.metricsEnabled).toBe(true);
    expect(view.run.coverage?.mode).toBe('guided');
    expect(view.run.coverage?.operationsScope).toBe('selected');
    expect(view.run.coverage?.selectedOperations).toEqual([
      'GET /users',
      'POST /users',
    ]);

    const usage = view.metrics.repairUsageByMotif ?? [];
    expect(usage.map((u) => u.motif)).toEqual(['alpha', 'zeta']);
    expect(usage[0]?.actions).toBe(3);
    expect(usage[0]?.itemsWithRepair).toBe(1);
    // actions=0 forces itemsWithRepair to 0
    expect(usage[1]?.itemsWithRepair).toBe(0);

    const planning = view.metrics.coverage?.planning;
    expect(planning?.plannerCapsHit?.length).toBe(2);
    expect(planning?.plannedTargetsTotal).toBe(1);
    expect(planning?.unplannedTargetsTotal).toBe(2);
    expect(view.metrics.coverage?.thresholds?.overall).toBe(
      coverage.metrics.thresholds?.overall
    );
  });

  it('handles runs without coverage reports', () => {
    const metrics = baseMetrics({
      repairUsageByMotif: [
        {
          motifId: 'm1',
          gValid: false,
          items: 0,
          itemsWithRepair: 0,
          actions: 0,
        },
      ],
    });
    const view = buildReporterPlatformView({
      metrics,
      seed: 7,
      metricsEnabled: false,
    });

    expect(view.run.coverage?.mode).toBe('off');
    expect(view.run.metricsEnabled).toBe(false);
    expect(view.metrics.coverage).toBeUndefined();
    expect(view.run.registryFingerprint).toBeUndefined();
  });
});
