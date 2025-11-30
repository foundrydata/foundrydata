import { describe, it, expect } from 'vitest';
import type { CoverageReport, CoverageTargetReport } from '@foundrydata/shared';

import { executePipeline } from '../../src/pipeline/orchestrator.js';

const openApiAcceptanceDoc = {
  openapi: '3.1.0',
  paths: {
    '/users': {
      get: {
        operationId: 'getUsers',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  filter: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'ok',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
            },
          },
        },
      },
      post: {
        responses: {
          '201': {
            description: 'created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                  },
                  required: ['id'],
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

function normalizeCoverageReport(report: CoverageReport): unknown {
  const sortedTargets = [...report.targets].sort((a, b) =>
    a.id.localeCompare(b.id)
  );
  const sortedUncovered = [...report.uncoveredTargets].sort((a, b) =>
    a.id.localeCompare(b.id)
  );
  const sortedHints = [...report.unsatisfiedHints].sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b))
  );
  const sortedCaps = [...report.diagnostics.plannerCapsHit].sort((a, b) =>
    a.scopeKey.localeCompare(b.scopeKey)
  );

  return {
    ...report,
    run: {
      ...report.run,
      // Timestamps are explicitly allowed to differ between runs.
      startedAt: 'normalized',
      durationMs: 0,
    },
    diagnostics: {
      ...report.diagnostics,
      plannerCapsHit: sortedCaps,
    },
    targets: sortedTargets,
    uncoveredTargets: sortedUncovered,
    unsatisfiedHints: sortedHints,
  };
}

describe('OpenAPI coverage acceptance scenarios', () => {
  it('keeps coverage.byOperation stable across measure vs guided and populates OP_* targets for operations with and without operationId', async () => {
    const baseOptions = {
      mode: 'strict' as const,
      generate: {
        count: 4,
        seed: 2026,
      } as const,
      validate: {
        validateFormats: false,
      } as const,
    } as const;

    const measureResult = await executePipeline(openApiAcceptanceDoc, {
      ...baseOptions,
      coverage: {
        mode: 'measure' as const,
        dimensionsEnabled: ['structure', 'operations'] as const,
      },
    });

    const guidedResult = await executePipeline(openApiAcceptanceDoc, {
      ...baseOptions,
      coverage: {
        mode: 'guided' as const,
        dimensionsEnabled: ['structure', 'operations'] as const,
      },
    });

    expect(measureResult.status).toBe('completed');
    expect(guidedResult.status).toBe('completed');

    const measureReport = measureResult.artifacts.coverageReport;
    const guidedReport = guidedResult.artifacts.coverageReport;
    expect(measureReport).toBeDefined();
    expect(guidedReport).toBeDefined();

    const measureByOp = measureReport!.metrics.byOperation;
    const guidedByOp = guidedReport!.metrics.byOperation;

    const measureKeys = Object.keys(measureByOp).sort();
    const guidedKeys = Object.keys(guidedByOp).sort();

    // We expect entries for the operation with operationId and the one without (using "<METHOD> <path>"),
    // and a stable set of operation keys across coverage modes.
    expect(measureKeys).toEqual(
      expect.arrayContaining(['getUsers', 'POST /users'])
    );
    expect(guidedKeys).toEqual(measureKeys);

    const guidedOperationsTargets = guidedReport!.targets.filter(
      (target) => target.dimension === 'operations'
    );

    const requestTargets = guidedOperationsTargets.filter(
      (target) => target.kind === 'OP_REQUEST_COVERED'
    );
    const responseTargets = guidedOperationsTargets.filter(
      (target) => target.kind === 'OP_RESPONSE_COVERED'
    );

    expect(requestTargets.length).toBeGreaterThanOrEqual(1);
    expect(responseTargets.length).toBeGreaterThanOrEqual(1);

    // At least one request/response pair should be attributed to the operationId-based key.
    expect(
      requestTargets.some((target) => target.operationKey === 'getUsers')
    ).toBe(true);
    expect(
      responseTargets.some((target) => target.operationKey === 'getUsers')
    ).toBe(true);

    // And at least one response should be attributed to the "<METHOD> <path>" key.
    expect(
      responseTargets.some((target) => target.operationKey === 'POST /users')
    ).toBe(true);

    // coverage.byOperation ratios must be valid numbers in [0,1] in both modes.
    measureKeys.forEach((key) => {
      const measureValue = measureByOp[key];
      const guidedValue = guidedByOp[key];
      expect(typeof measureValue).toBe('number');
      expect(typeof guidedValue).toBe('number');
      expect(measureValue).toBeGreaterThanOrEqual(0);
      expect(measureValue).toBeLessThanOrEqual(1);
      expect(guidedValue).toBeGreaterThanOrEqual(0);
      expect(guidedValue).toBeLessThanOrEqual(1);
    });
  });

  it('produces reproducible coverage reports for identical OpenAPI runs', async () => {
    const options = {
      mode: 'strict' as const,
      generate: {
        count: 4,
        seed: 2026,
      },
      validate: {
        validateFormats: false,
      },
      coverage: {
        mode: 'measure' as const,
        dimensionsEnabled: ['structure', 'operations'] as const,
      },
    } as const;

    const first = await executePipeline(openApiAcceptanceDoc, options);
    const second = await executePipeline(openApiAcceptanceDoc, options);

    expect(first.status).toBe('completed');
    expect(second.status).toBe('completed');

    const firstReport = first.artifacts.coverageReport as
      | CoverageReport
      | undefined;
    const secondReport = second.artifacts.coverageReport as
      | CoverageReport
      | undefined;

    expect(firstReport).toBeDefined();
    expect(secondReport).toBeDefined();

    const normalizedFirst = normalizeCoverageReport(firstReport!);
    const normalizedSecond = normalizeCoverageReport(secondReport!);

    expect(normalizedSecond).toEqual(normalizedFirst);

    // Sanity check: targets and uncoveredTargets arrays remain aligned with metrics.
    const metrics = firstReport!.metrics;
    const activeTargets = firstReport!.targets.filter(
      (target: CoverageTargetReport) =>
        target.status === undefined || target.status === 'active'
    );
    expect(metrics.targetsByStatus.active).toBeGreaterThanOrEqual(
      activeTargets.length
    );
  });
});
