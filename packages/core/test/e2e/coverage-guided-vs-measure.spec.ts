import { describe, it, expect } from 'vitest';

import { executePipeline } from '../../src/pipeline/orchestrator.js';
import type { CoverageReport, CoverageTargetReport } from '@foundrydata/shared';

type CoverageMode = 'measure' | 'guided';

interface CoverageRun {
  report: CoverageReport;
  targets: CoverageTargetReport[];
  hitById: Map<string, boolean>;
}

const SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  properties: {
    branch: {
      oneOf: [{ const: 'A' }, { const: 'B' }, { const: 'C' }],
    },
    flavor: {
      enum: ['vanilla', 'chocolate', 'strawberry', 'mint'],
    },
  },
  required: ['branch', 'flavor'],
} as const;

function getReport(result: unknown): CoverageReport | undefined {
  return (result as { artifacts?: { coverageReport?: CoverageReport } })
    .artifacts?.coverageReport;
}

function getTargets(
  report: CoverageReport | undefined
): CoverageTargetReport[] {
  return report?.targets ?? [];
}

async function runCoverage(mode: CoverageMode): Promise<CoverageRun> {
  const result = await executePipeline(SCHEMA, {
    generate: { count: 6, seed: 37 },
    validate: { validateFormats: false },
    coverage: {
      mode,
      dimensionsEnabled: ['branches', 'enum', 'structure'],
      excludeUnreachable: false,
    },
  });

  expect(result.status).toBe('completed');

  const report = getReport(result);
  expect(report).toBeDefined();

  const targets = getTargets(report);
  const hitById = new Map(targets.map((t) => [t.id, Boolean(t.hit)]));

  return { report: report!, targets, hitById };
}

const toIdSet = (targets: Array<{ id: string }>): Set<string> =>
  new Set(targets.map((t) => t.id));

const countHitsByDimension = (
  targets: CoverageTargetReport[],
  hitById: Map<string, boolean>
): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const target of targets) {
    const status = target.status ?? 'active';
    if (status === 'deprecated') continue;
    if (hitById.get(target.id) !== true) continue;
    const dim = target.dimension;
    counts[dim] = (counts[dim] ?? 0) + 1;
  }
  return counts;
};

function assertGuidedVsMeasureInvariants(
  measure: CoverageRun,
  guided: CoverageRun
): void {
  expect(toIdSet(guided.targets)).toEqual(toIdSet(measure.targets));

  const guidedHits = countHitsByDimension(guided.targets, guided.hitById);
  const measureHits = countHitsByDimension(measure.targets, measure.hitById);

  const guidedMetrics = guided.report.metrics.byDimension;
  const measureMetrics = measure.report.metrics.byDimension;

  for (const dim of ['branches', 'enum'] as const) {
    expect(guidedMetrics[dim] ?? 0).toBeGreaterThanOrEqual(
      measureMetrics[dim] ?? 0
    );
    expect(guidedHits[dim] ?? 0).toBeGreaterThanOrEqual(measureHits[dim] ?? 0);
  }

  const guidedUncoveredIds = new Set(
    (guided.report.uncoveredTargets ?? []).map((target) => target.id)
  );
  const measureUncoveredIds = new Set(
    (measure.report.uncoveredTargets ?? []).map((target) => target.id)
  );

  expect(guidedUncoveredIds.size).toBeLessThanOrEqual(measureUncoveredIds.size);
}

describe('coverage guided vs measure invariance', () => {
  it('keeps guided coverage >= measure for branches/enum with stable target IDs', async () => {
    const measure = await runCoverage('measure');
    const guided = await runCoverage('guided');

    assertGuidedVsMeasureInvariants(measure, guided);
  });
});
