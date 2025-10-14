import { describe, expect, it } from 'vitest';

import { compose as runCompose } from '../../transform/composition-engine';
import { MetricsCollector } from '../../util/metrics';
import { executePipeline } from '../orchestrator';

describe('executePipeline', () => {
  it('runs normalize then compose with metrics captured', async () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'integer' },
        title: { type: 'string' },
      },
    };

    const result = await executePipeline(schema);

    expect(result.status).toBe('completed');
    expect(result.timeline).toEqual(['normalize', 'compose']);

    const normalizeStage = result.stages.normalize;
    const composeStage = result.stages.compose;

    expect(normalizeStage.status).toBe('completed');
    expect(normalizeStage.output?.schema).toBeDefined();
    expect(normalizeStage.output?.notes).toBeDefined();
    expect(composeStage.status).toBe('completed');
    expect(composeStage.output?.coverageIndex.size).toBeGreaterThan(0);
    expect(result.artifacts.canonical).toBe(normalizeStage.output);
    expect(result.artifacts.effective).toBe(composeStage.output);

    expect(result.metrics.normalizeMs).toBeGreaterThanOrEqual(0);
    expect(result.metrics.composeMs).toBeGreaterThanOrEqual(0);
  });

  it('stops the pipeline when normalization fails', async () => {
    const schema = { type: 'string' };
    const result = await executePipeline(
      schema,
      {},
      {
        normalize() {
          throw 'boom';
        },
      }
    );

    expect(result.status).toBe('failed');
    expect(result.timeline).toEqual(['normalize']);

    const normalizeStage = result.stages.normalize;
    expect(normalizeStage.status).toBe('failed');
    expect(normalizeStage.error?.stage).toBe('normalize');
    expect(normalizeStage.error?.message).toBe('boom');

    expect(result.stages.compose.status).toBe('skipped');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].stage).toBe('normalize');
    expect(result.errors[0].message).toBe('boom');
  });

  it('passes canonical schema to compose override and reuses custom metrics collector', async () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        slug: { const: 'alpha' },
      },
    };

    const collector = new MetricsCollector({
      now: () => 0,
      verbosity: 'ci',
    });

    let composeInput: unknown;

    const result = await executePipeline(
      schema,
      {
        collector,
        snapshotVerbosity: 'ci',
      },
      {
        compose(canonicalSchema, options) {
          composeInput = canonicalSchema;
          return runCompose(canonicalSchema, options);
        },
      }
    );

    const normalizeOutput = result.stages.normalize.output;
    expect(normalizeOutput).toBeDefined();
    expect(composeInput).toStrictEqual(normalizeOutput?.schema);
    expect(result.artifacts.canonical).toBe(normalizeOutput);
    expect(result.artifacts.effective).toBe(result.stages.compose.output);

    const expectedSnapshot = collector.snapshotMetrics({ verbosity: 'ci' });
    expect(result.metrics).toStrictEqual(expectedSnapshot);
    expect(result.timeline).toEqual(['normalize', 'compose']);
  });
});
