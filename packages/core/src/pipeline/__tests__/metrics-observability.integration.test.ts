import { describe, expect, it } from 'vitest';

import { executePipeline } from '../orchestrator.js';
import { normalizePipelineResultForDeterminism } from '../../../test/util/determinism-compare.js';

describe('metrics observability', () => {
  it('records branch trials and eval-trace metrics without affecting determinism view', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      unevaluatedProperties: false,
      properties: {
        kind: { enum: ['alpha', 'beta'] },
        value: { type: 'string', minLength: 1 },
      },
      required: ['kind', 'value'],
      oneOf: [
        {
          properties: {
            kind: { const: 'alpha' },
            value: { type: 'string', minLength: 1 },
          },
          required: ['kind', 'value'],
        },
        {
          properties: {
            kind: { const: 'beta' },
            value: { type: 'string', minLength: 2 },
          },
          required: ['kind', 'value'],
        },
      ],
    } as const;

    const result = await executePipeline(schema, {
      metrics: { enabled: true, verbosity: 'ci' },
      generate: { count: 1, seed: 7 },
      validate: { validateFormats: false },
    });

    expect(result.status).toBe('completed');
    expect(result.metrics.branchTrialsTried).toBeGreaterThan(0);
    expect(result.metrics.evalTraceChecks).toBeGreaterThan(0);
    expect(result.metrics.evalTraceProved).toBeGreaterThan(0);
    expect(result.metrics.evalTraceProved).toBeLessThanOrEqual(
      result.metrics.evalTraceChecks
    );

    const deterministic = normalizePipelineResultForDeterminism(result);
    expect(deterministic.metrics?.branchTrialsTried).toBe(
      result.metrics.branchTrialsTried
    );
  });

  it('averages repairActionsPerRow across items', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'integer',
    } as const;

    const actions = [
      { action: 'noop', canonPath: '#', details: { idx: 0 } },
      { action: 'noop', canonPath: '#', details: { idx: 1 } },
      { action: 'noop', canonPath: '#', details: { idx: 1 } },
    ];

    const result = await executePipeline(
      schema,
      {
        metrics: { enabled: true, verbosity: 'ci' },
        generate: { count: 1, seed: 11 },
        validate: { validateFormats: false },
      },
      {
        generate: () => ({
          items: [1, 2],
          diagnostics: [],
          seed: 11,
          metrics: { patternWitnessTried: 0 },
        }),
        repair: (items) => ({ items, actions }),
      }
    );

    expect(result.status).toBe('completed');
    expect(result.metrics.repairActionsPerRow).toBeCloseTo(actions.length / 2);
  });
});
