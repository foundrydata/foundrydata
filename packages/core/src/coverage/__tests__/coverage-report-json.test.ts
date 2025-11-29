import { describe, it, expect } from 'vitest';

import type { CoverageDimension, CoverageReport } from '@foundrydata/shared';
import { executePipeline } from '../../pipeline/orchestrator.js';
import { DEFAULT_PLANNER_DIMENSIONS_ENABLED } from '../coverage-planner.js';

const STRUCTURE_ONLY_DIMENSIONS: CoverageDimension[] = ['structure'];

describe('coverage-report/v1 JSON snapshots', () => {
  it('emits a stable coverage-report/v1 JSON structure for a simple object schema', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'integer', minimum: 0 },
        title: { type: 'string', minLength: 1 },
      },
      required: ['id', 'title'],
    } as const;

    const result = await executePipeline(schema, {
      generate: { count: 3, seed: 37 },
      validate: { validateFormats: false },
      coverage: {
        mode: 'measure',
        dimensionsEnabled: ['structure', 'branches'],
        excludeUnreachable: false,
      },
    });

    const report = result.artifacts.coverageReport as
      | CoverageReport
      | undefined;
    expect(report).toBeDefined();
    const baseReport = report as CoverageReport;

    // Normalise non-deterministic fields before snapshotting
    const normalised: CoverageReport = {
      ...baseReport,
      run: {
        ...baseReport.run,
        startedAt: '<normalized-timestamp>',
        durationMs: 0,
      },
    };

    expect({
      version: normalised.version,
      reportMode: normalised.reportMode,
      engine: normalised.engine,
      run: {
        coverageMode: normalised.engine.coverageMode,
        seed: normalised.run.seed,
        masterSeed: normalised.run.masterSeed,
        maxInstances: normalised.run.maxInstances,
        actualInstances: normalised.run.actualInstances,
        dimensionsEnabled: normalised.run.dimensionsEnabled,
        excludeUnreachable: normalised.run.excludeUnreachable,
        startedAt: normalised.run.startedAt,
        durationMs: normalised.run.durationMs,
      },
      metrics: normalised.metrics,
      targetsByStatus: normalised.metrics.targetsByStatus,
    }).toMatchSnapshot();

    expect(normalised.metrics.targetsByStatus.active).toBeGreaterThanOrEqual(0);
    expect(
      normalised.metrics.targetsByStatus.unreachable
    ).toBeGreaterThanOrEqual(0);

    // Pre-9310 scenario: no operations dimension yet, so byOperation should be empty
    expect(normalised.metrics.byOperation).toEqual({});
  });

  it('defaults dimensionsEnabled when the flag is not supplied', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        id: { type: 'number' },
      },
      required: ['id'],
    } as const;

    const result = await executePipeline(schema, {
      generate: { count: 1, seed: 123 },
      validate: { validateFormats: false },
      coverage: {
        mode: 'measure',
        excludeUnreachable: true,
      },
    });

    const report = result.artifacts.coverageReport as
      | CoverageReport
      | undefined;
    expect(report).toBeDefined();
    expect(report?.run.dimensionsEnabled).toEqual(
      DEFAULT_PLANNER_DIMENSIONS_ENABLED
    );
    expect(report?.reportMode).toBe('full');
  });

  it('honors summary reportMode and emits an empty targets array', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        flag: { enum: ['a', 'b'] },
      },
      required: ['flag'],
    } as const;

    const result = await executePipeline(schema, {
      generate: { count: 1, seed: 55 },
      validate: { validateFormats: false },
      coverage: {
        mode: 'measure',
        dimensionsEnabled: ['structure', 'branches'],
        reportMode: 'summary',
        excludeUnreachable: false,
      },
    });

    const report = result.artifacts.coverageReport as
      | CoverageReport
      | undefined;
    expect(report).toBeDefined();
    expect(report?.reportMode).toBe('summary');
    expect(report?.targets).toEqual([]);
    expect(report?.uncoveredTargets.length).toBeGreaterThanOrEqual(0);
  });

  it('respects excludeUnreachable toggle in metrics while keeping IDs and statuses stable', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'integer', minimum: 0 },
        title: { type: 'string', minLength: 1 },
        description: { type: 'string' },
      },
      required: ['id', 'title'],
    } as const;

    const baseOptions = {
      generate: { count: 4, seed: 41 },
      validate: { validateFormats: false },
    } as const;

    const withExclude = await executePipeline(schema, {
      ...baseOptions,
      coverage: {
        mode: 'measure',
        dimensionsEnabled: STRUCTURE_ONLY_DIMENSIONS,
        excludeUnreachable: true,
        minCoverage: 0.9,
      },
    });

    const withoutExclude = await executePipeline(schema, {
      ...baseOptions,
      coverage: {
        mode: 'measure',
        dimensionsEnabled: STRUCTURE_ONLY_DIMENSIONS,
        excludeUnreachable: false,
        minCoverage: 0.9,
      },
    });

    const reportWithExclude = withExclude.artifacts.coverageReport as
      | CoverageReport
      | undefined;
    const reportWithoutExclude = withoutExclude.artifacts.coverageReport as
      | CoverageReport
      | undefined;

    expect(reportWithExclude).toBeDefined();
    expect(reportWithoutExclude).toBeDefined();

    expect(reportWithExclude!.targets.map((t) => t.id).sort()).toEqual(
      reportWithoutExclude!.targets.map((t) => t.id).sort()
    );
    expect(
      reportWithExclude!.targets.map((t) => t.status ?? 'active').sort()
    ).toEqual(
      reportWithoutExclude!.targets.map((t) => t.status ?? 'active').sort()
    );

    const metricsWithExclude = reportWithExclude!.metrics;
    const metricsWithoutExclude = reportWithoutExclude!.metrics;

    expect(metricsWithExclude.overall).toBeGreaterThanOrEqual(
      metricsWithoutExclude.overall
    );

    // Thresholds wiring: thresholds.overall is populated from minCoverage
    expect(metricsWithExclude.thresholds?.overall).toBe(0.9);
    expect(metricsWithoutExclude.thresholds?.overall).toBe(0.9);

    // Determinism: running twice with same options yields same normalised report
    const repeat = await executePipeline(schema, {
      ...baseOptions,
      coverage: {
        mode: 'measure',
        dimensionsEnabled: STRUCTURE_ONLY_DIMENSIONS,
        excludeUnreachable: false,
        minCoverage: 0.9,
      },
    });
    const repeatReport = repeat.artifacts.coverageReport as
      | CoverageReport
      | undefined;
    expect(repeatReport).toBeDefined();

    const normalizeForDeterminism = (
      report: CoverageReport
    ): CoverageReport => ({
      ...report,
      run: {
        ...report.run,
        startedAt: '<normalized-timestamp>',
        durationMs: 0,
      },
    });

    expect(normalizeForDeterminism(repeatReport!)).toEqual(
      normalizeForDeterminism(reportWithoutExclude!)
    );

    expect({
      withExclude: metricsWithExclude.targetsByStatus,
      withoutExclude: metricsWithoutExclude.targetsByStatus,
    }).toMatchSnapshot();
  });

  it('reports coverageStatus minCoverageNotMet when overall is below minCoverage', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      oneOf: [
        {
          type: 'object',
          properties: {
            choice: { const: 'a' },
          },
          required: ['choice'],
        },
        {
          type: 'object',
          properties: {
            choice: { const: 'b' },
          },
          required: ['choice'],
        },
      ],
    } as const;

    const result = await executePipeline(schema, {
      generate: { count: 1, seed: 101 },
      validate: { validateFormats: false },
      coverage: {
        mode: 'measure',
        dimensionsEnabled: ['structure', 'branches'],
        minCoverage: 0.8,
      },
    });

    const report = result.artifacts.coverageReport;
    expect(report).toBeDefined();
    expect(report?.metrics.coverageStatus).toBe('minCoverageNotMet');
    expect(report?.metrics.thresholds?.overall).toBe(0.8);
    expect(report?.metrics.overall ?? 1).toBeLessThan(0.8);
  });
});
