import { describe, expect, it } from 'vitest';

import {
  compose as runCompose,
  type ComposeInput,
} from '../../transform/composition-engine';
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
    // Debug removed; keep test concise

    expect(result.status).toBe('completed');
    // Backward-compat: at minimum the first two stages must run
    expect(result.timeline.slice(0, 2)).toEqual(['normalize', 'compose']);

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
    expect(result.errors[0]!.stage).toBe('normalize');
    expect(result.errors[0]!.message).toBe('boom');
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

    let composeInput: ComposeInput | undefined;

    const result = await executePipeline(
      schema,
      {
        collector,
        snapshotVerbosity: 'ci',
      },
      {
        compose(input, options) {
          composeInput = input;
          return runCompose(input, options);
        },
      }
    );

    const normalizeOutput = result.stages.normalize.output;
    expect(normalizeOutput).toBeDefined();
    expect(composeInput).toStrictEqual(normalizeOutput);
    expect(result.artifacts.canonical).toBe(normalizeOutput);
    expect(result.artifacts.effective).toBe(result.stages.compose.output);

    const expectedSnapshot = collector.snapshotMetrics({ verbosity: 'ci' });
    expect(result.metrics).toStrictEqual(expectedSnapshot);
    expect(result.timeline.slice(0, 2)).toEqual(['normalize', 'compose']);
  });

  it('runs full 5-stage pipeline with default stages and validates output', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'integer', minimum: 0 },
        title: { type: 'string', minLength: 1 },
      },
      required: ['id', 'title'],
    };

    const result = await executePipeline(schema, {
      generate: { count: 1 },
      validate: { validateFormats: false },
    });

    expect(result.status).toBe('completed');
    expect(result.timeline).toEqual([
      'normalize',
      'compose',
      'generate',
      'repair',
      'validate',
    ]);

    // Stage statuses
    expect(result.stages.normalize.status).toBe('completed');
    expect(result.stages.compose.status).toBe('completed');
    expect(result.stages.generate.status).toBe('completed');
    expect(result.stages.repair.status).toBe('completed');
    expect(result.stages.validate.status).toBe('completed');

    // Artifacts captured
    expect(Array.isArray(result.artifacts.generated?.items)).toBe(true);
    expect(Array.isArray(result.artifacts.repaired)).toBe(true);
    expect(result.artifacts.validation).toBeDefined();

    // Metrics present and non-negative
    expect(result.metrics.generateMs).toBeGreaterThanOrEqual(0);
    expect(result.metrics.repairMs).toBeGreaterThanOrEqual(0);
    expect(result.metrics.validateMs).toBeGreaterThanOrEqual(0);
    // Validations per row should be >= 1 (we validated at least one item)
    expect(result.metrics.validationsPerRow).toBeGreaterThanOrEqual(1);
  });

  it('supports overrides for generate/repair/validate stages', async () => {
    const schema = { type: 'string' };
    const seen: string[] = [];

    const result = await executePipeline(
      schema,
      {},
      {
        generate() {
          seen.push('generate');
          return {
            items: ['x'],
            diagnostics: [],
            metrics: {},
            seed: 0,
          };
        },
        repair(items) {
          seen.push('repair');
          return items;
        },
        validate(items) {
          seen.push('validate');
          return { valid: Array.isArray(items) };
        },
      }
    );

    expect(result.timeline).toEqual([
      'normalize',
      'compose',
      'generate',
      'repair',
      'validate',
    ]);
    expect(seen).toEqual(['generate', 'repair', 'validate']);
  });

  it('does not produce coverage artifacts when coverageMode is off', async () => {
    const schema = { type: 'string' };

    const result = await executePipeline(schema, {
      coverage: { mode: 'off' },
    });

    expect(result.status).toBe('completed');
    expect(result.artifacts.coverageGraph).toBeUndefined();
    expect(result.artifacts.coverageTargets).toBeUndefined();
  });

  it('wires coverage analyzer inputs under measure mode', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'integer', minimum: 0 },
      },
      required: ['id'],
    };

    const result = await executePipeline(schema, {
      generate: { count: 1 },
      validate: { validateFormats: false },
      coverage: { mode: 'measure' },
    });

    expect(result.status).toBe('completed');
    expect(result.timeline).toEqual([
      'normalize',
      'compose',
      'generate',
      'repair',
      'validate',
    ]);
    expect(result.artifacts.coverageGraph).toEqual({
      nodes: [],
      edges: [],
    });
    expect(result.artifacts.coverageTargets).toEqual([]);
  });
});
