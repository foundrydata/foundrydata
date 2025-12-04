import { describe, it, expect } from 'vitest';

import { executePipeline } from '../orchestrator.js';

describe('Repair coverage-independence — coverage=off vs coverage=measure', () => {
  it('produces identical Repair artefacts for coverage=off vs coverage=measure', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { enum: ['alpha', 'beta'] },
        alphaPayload: { type: 'string', minLength: 1 },
        betaPayload: { type: 'string', minLength: 1 },
      },
      required: ['kind'],
      allOf: [
        {
          if: {
            properties: { kind: { const: 'alpha' } },
            required: ['kind'],
          },
          then: {
            required: ['alphaPayload'],
          },
          else: {
            required: ['betaPayload'],
          },
        },
      ],
    } as const;

    const baseOptions = {
      generate: { count: 5, seed: 37 },
      validate: { validateFormats: false },
    } as const;

    const off = await executePipeline(schema, {
      ...baseOptions,
      coverage: { mode: 'off' },
    });
    const measure = await executePipeline(schema, {
      ...baseOptions,
      coverage: { mode: 'measure' },
    });

    expect(measure.status).toBe(off.status);
    expect(measure.timeline).toEqual(off.timeline);

    const repairedOff = off.artifacts.repaired ?? [];
    const repairedMeasure = measure.artifacts.repaired ?? [];
    expect(repairedMeasure).toEqual(repairedOff);

    const actionsOff = off.artifacts.repairActions ?? [];
    const actionsMeasure = measure.artifacts.repairActions ?? [];
    expect(actionsMeasure).toEqual(actionsOff);

    const diagsOff = off.artifacts.repairDiagnostics ?? [];
    const diagsMeasure = measure.artifacts.repairDiagnostics ?? [];
    expect(diagsMeasure).toEqual(diagsOff);

    const metricsOff = off.metrics;
    const metricsMeasure = measure.metrics;

    expect(metricsOff.repairPassesPerRow).toBe(
      metricsMeasure.repairPassesPerRow
    );
    expect(metricsOff.repairActionsPerRow).toBe(
      metricsMeasure.repairActionsPerRow
    );
  });

  it('produces identical Repair artefacts for measure with different dimensionsEnabled', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { enum: ['alpha', 'beta'] },
        alphaPayload: { type: 'string', minLength: 1 },
        betaPayload: { type: 'string', minLength: 1 },
      },
      required: ['kind'],
      allOf: [
        {
          if: {
            properties: { kind: { const: 'alpha' } },
            required: ['kind'],
          },
          then: {
            required: ['alphaPayload'],
          },
          else: {
            required: ['betaPayload'],
          },
        },
      ],
    } as const;

    const baseOptions = {
      generate: { count: 5, seed: 37 },
      validate: { validateFormats: false },
    } as const;

    const structureOnly = await executePipeline(schema, {
      ...baseOptions,
      coverage: {
        mode: 'measure',
        dimensionsEnabled: ['structure'],
        excludeUnreachable: false,
      },
    });
    const structureBranchesEnum = await executePipeline(schema, {
      ...baseOptions,
      coverage: {
        mode: 'measure',
        dimensionsEnabled: ['structure', 'branches', 'enum'],
        excludeUnreachable: false,
      },
    });

    const repairedA = structureOnly.artifacts.repaired ?? [];
    const repairedB = structureBranchesEnum.artifacts.repaired ?? [];
    expect(repairedB).toEqual(repairedA);

    const actionsA = structureOnly.artifacts.repairActions ?? [];
    const actionsB = structureBranchesEnum.artifacts.repairActions ?? [];
    expect(actionsB).toEqual(actionsA);

    const diagsA = structureOnly.artifacts.repairDiagnostics ?? [];
    const diagsB = structureBranchesEnum.artifacts.repairDiagnostics ?? [];
    expect(diagsB).toEqual(diagsA);

    const metricsA = structureOnly.metrics;
    const metricsB = structureBranchesEnum.metrics;

    expect(metricsA.repairPassesPerRow).toBe(metricsB.repairPassesPerRow);
    expect(metricsA.repairActionsPerRow).toBe(metricsB.repairActionsPerRow);
  });
});
