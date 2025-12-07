import { describe, it, expect } from 'vitest';

import { normalize } from '../../transform/schema-normalizer.js';
import { compose } from '../../transform/composition-engine.js';

import {
  shouldRunCoverageAnalyzer,
  resolveCoverageDimensions,
  planCoverageForPipeline,
  evaluateCoverageAndBuildReport,
} from '../runtime.js';

import type {
  CoverageDimension,
  CoverageReport,
  CoverageTargetReport,
  CoverageTarget,
  PlannerCapHit,
} from '@foundrydata/shared';

type PlannerScopeStats = {
  total: number;
  planned: number;
  unplanned: number;
};

type TargetReport = CoverageTarget | CoverageTargetReport;

const isTargetUnplanned = (target: TargetReport): boolean =>
  (target.meta as { planned?: unknown } | undefined)?.planned === false;

const computeScopeStats = (
  targets: TargetReport[],
  hit: PlannerCapHit
): PlannerScopeStats => {
  const scopedTargets = targets.filter((target) => {
    if (target.dimension !== hit.dimension) return false;
    const status = target.status ?? 'active';
    if (status !== 'active') return false;
    if (hit.scopeType === 'operation') {
      if (target.operationKey === hit.scopeKey) return true;
      const metaOps = (target.meta as { operationKeys?: unknown } | undefined)
        ?.operationKeys;
      return Array.isArray(metaOps) && metaOps.includes(hit.scopeKey);
    }
    if (hit.scopeKey.startsWith('dimension:')) {
      return true;
    }
    return target.canonPath === hit.scopeKey;
  });

  const planned = scopedTargets.filter(
    (target) => !isTargetUnplanned(target)
  ).length;
  const unplanned = scopedTargets.filter(isTargetUnplanned).length;

  return { total: scopedTargets.length, planned, unplanned };
};

describe('coverage runtime helper', () => {
  it('gates Analyzer/Planner based on coverage.mode', () => {
    expect(shouldRunCoverageAnalyzer(undefined)).toBe(false);
    expect(
      shouldRunCoverageAnalyzer({
        mode: 'off',
      } as any)
    ).toBe(false);
    expect(
      shouldRunCoverageAnalyzer({
        mode: 'measure',
      } as any)
    ).toBe(true);
    expect(
      shouldRunCoverageAnalyzer({
        mode: 'guided',
      } as any)
    ).toBe(true);
  });

  it('resolves dimensionsEnabled with defaults when omitted', () => {
    const explicit: CoverageDimension[] = ['structure', 'branches'];
    expect(resolveCoverageDimensions(explicit)).toEqual(explicit);

    const defaulted = resolveCoverageDimensions(undefined);
    expect(Array.isArray(defaulted)).toBe(true);
    expect(defaulted.length).toBeGreaterThan(0);
  });

  it('plans coverage targets and TestUnits deterministically for guided mode', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'integer', minimum: 0 },
        kind: { enum: ['a', 'b'] },
      },
      required: ['id', 'kind'],
    } as const;

    const normalizeResult = normalize(schema);
    const composeResult = compose(normalizeResult, {});

    const plan = planCoverageForPipeline({
      canonicalSchema: normalizeResult.schema,
      normalizeResult,
      composeResult,
      coverageOptions: {
        mode: 'guided',
        dimensionsEnabled: ['structure', 'branches'],
      },
      generateOptions: {
        count: 5,
        seed: 37,
      },
      testOverrides: undefined,
    });

    expect(plan).toBeDefined();
    const result = plan!;

    expect(result.mode).toBe('guided');
    expect(result.graph.nodes.length).toBeGreaterThan(0);
    expect(result.targets.length).toBeGreaterThan(0);
    expect(result.plannedTargets.length).toBeGreaterThan(0);
    expect(result.dimensionsEnabled).toEqual(['structure', 'branches']);

    expect(Array.isArray(result.plannerCapsHit)).toBe(true);
    expect(Array.isArray(result.unsatisfiedHints)).toBe(true);
    expect(Array.isArray(result.plannedTestUnits)).toBe(true);

    // Determinism: running the planner twice with the same inputs yields the same seeds.
    const planRepeat = planCoverageForPipeline({
      canonicalSchema: normalizeResult.schema,
      normalizeResult,
      composeResult,
      coverageOptions: {
        mode: 'guided',
        dimensionsEnabled: ['structure', 'branches'],
      },
      generateOptions: {
        count: 5,
        seed: 37,
      },
      testOverrides: undefined,
    })!;

    const seeds = result.plannedTestUnits.map((u) => u.seed).sort();
    const seedsRepeat = planRepeat.plannedTestUnits.map((u) => u.seed).sort();
    expect(seedsRepeat).toEqual(seeds);
  });

  it('evaluates coverage metrics and builds coverage-report/v1 using the runtime helper', () => {
    const dimensionsEnabled: CoverageDimension[] = ['structure', 'branches'];

    const targets: CoverageTargetReport[] = [
      {
        id: 't-1',
        dimension: 'structure',
        kind: 'SCHEMA_NODE',
        canonPath: '#',
        hit: true,
      },
      {
        id: 't-2',
        dimension: 'branches',
        kind: 'ONEOF_BRANCH',
        canonPath: '#/oneOf/0',
        hit: false,
      },
    ];

    const { metrics, report, uncoveredTargets } =
      evaluateCoverageAndBuildReport({
        mode: 'measure',
        dimensionsEnabled,
        coverageOptions: {
          mode: 'measure',
          dimensionsEnabled,
          excludeUnreachable: true,
          minCoverage: 0.5,
          reportMode: 'summary',
        },
        targets,
        plannerCapsHit: [],
        unsatisfiedHints: [],
        runInfo: {
          seed: 123,
          maxInstances: 10,
          actualInstances: 3,
          startedAtIso: '2025-01-01T00:00:00.000Z',
          durationMs: 42,
          metricsEnabled: true,
        },
        engineInfo: {
          foundryVersion: '0.0-test',
          ajvMajor: 8,
        },
      });

    expect(metrics.overall).toBeGreaterThanOrEqual(0);
    expect(metrics.overall).toBeLessThanOrEqual(1);
    expect(metrics.thresholds?.overall).toBe(0.5);

    expect(uncoveredTargets.length).toBeGreaterThan(0);

    const fullReport = report as CoverageReport;
    expect(fullReport.version).toBeDefined();
    expect(fullReport.engine.coverageMode).toBe('measure');
    expect(fullReport.run.seed).toBe(123);
    expect(fullReport.run.masterSeed).toBe(123);
    expect(fullReport.run.maxInstances).toBe(10);
    expect(fullReport.run.actualInstances).toBe(3);
    expect(fullReport.run.dimensionsEnabled).toEqual(dimensionsEnabled);
    expect(fullReport.run.excludeUnreachable).toBe(true);
    expect(fullReport.run.metricsEnabled).toBe(true);

    expect(fullReport.reportMode).toBe('summary');
    expect(fullReport.metrics.overall).toBe(metrics.overall);
    expect(Array.isArray(fullReport.uncoveredTargets)).toBe(true);
  });

  it('keeps planner caps aggregates aligned with planned:false targets', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      oneOf: [
        {
          type: 'object',
          properties: { kind: { const: 'a' } },
          required: ['kind'],
        },
        {
          type: 'object',
          properties: { kind: { const: 'b' } },
          required: ['kind'],
        },
        {
          type: 'object',
          properties: { kind: { const: 'c' } },
          required: ['kind'],
        },
      ],
    } as const;

    const normalizeResult = normalize(schema);
    const composeResult = compose(normalizeResult, {});

    const plan = planCoverageForPipeline({
      canonicalSchema: normalizeResult.schema,
      normalizeResult,
      composeResult,
      coverageOptions: {
        mode: 'guided',
        dimensionsEnabled: ['branches', 'structure'],
        planner: {
          caps: {
            maxTargetsPerDimension: { branches: 1 },
            maxTargetsPerSchema: 1,
          },
        },
      },
      generateOptions: {
        count: 4,
        seed: 19,
      },
      testOverrides: undefined,
    });

    expect(plan).toBeDefined();
    const plannedTargets = plan!.plannedTargets;
    const plannerCapsHit = plan!.plannerCapsHit;

    const unplannedTargets = plannedTargets.filter(
      (target) =>
        (target.meta as { planned?: unknown } | undefined)?.planned === false
    );
    expect(unplannedTargets.length).toBeGreaterThan(0);

    for (const hit of plannerCapsHit) {
      const stats = computeScopeStats(plannedTargets, hit);
      expect(stats.total).toBe(hit.totalTargets);
      expect(stats.planned).toBe(hit.plannedTargets);
      expect(stats.unplanned).toBe(hit.unplannedTargets);
    }
  });
});
