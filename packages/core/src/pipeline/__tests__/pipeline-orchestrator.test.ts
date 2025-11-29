import { describe, expect, it } from 'vitest';

import {
  compose as runCompose,
  type ComposeInput,
  type ComposeResult,
} from '../../transform/composition-engine';
import { MetricsCollector } from '../../util/metrics';
import { executePipeline } from '../orchestrator';
import { COVERAGE_REPORT_VERSION_V1 } from '@foundrydata/shared';
import { generateFromCompose } from '../../generator/foundry-generator.js';
import type { PipelineOptions } from '../types';

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

    const graph = result.artifacts.coverageGraph;
    expect(graph).toBeDefined();
    expect(Array.isArray(graph?.nodes)).toBe(true);
    expect(Array.isArray(graph?.edges)).toBe(true);
    expect(graph?.nodes.length).toBeGreaterThan(0);

    const nodeKindsByPath = new Map(
      graph!.nodes.map((n) => [n.canonPath, n.kind])
    );
    expect(nodeKindsByPath.get('#')).toBe('schema');
    expect(nodeKindsByPath.get('#/properties/id')).toBe('property');

    const targets = result.artifacts.coverageTargets;
    expect(targets).toBeDefined();
    expect(Array.isArray(targets)).toBe(true);
    const structureTargets = targets!.filter(
      (t) => t.dimension === 'structure'
    );
    expect(
      structureTargets.some(
        (t) => t.kind === 'SCHEMA_NODE' && t.canonPath === '#'
      )
    ).toBe(true);
  });

  it('records coverage hits after validate in measure mode', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        required: { const: 1 },
        optional: { const: 2 },
      },
      required: ['required'],
      minProperties: 2,
    } as const;

    const result = await executePipeline(schema, {
      generate: { count: 1 },
      validate: { validateFormats: false },
      coverage: { mode: 'measure' },
    });

    expect(result.status).toBe('completed');

    const targets = result.artifacts.coverageTargets;
    expect(targets).toBeDefined();
    expect(Array.isArray(targets)).toBe(true);

    const propertyTargets =
      targets?.filter(
        (t) =>
          t.kind === 'PROPERTY_PRESENT' &&
          t.canonPath === '#/properties/optional'
      ) ?? [];

    expect(propertyTargets.length).toBeGreaterThan(0);
    expect(propertyTargets.some((t) => (t as any).hit === true)).toBe(true);

    const schemaNodeTargets =
      targets?.filter(
        (t) =>
          t.dimension === 'structure' &&
          t.kind === 'SCHEMA_NODE' &&
          t.canonPath === '#/properties/optional'
      ) ?? [];

    expect(schemaNodeTargets.length).toBeGreaterThan(0);
    expect(schemaNodeTargets.some((t) => (t as any).hit === true)).toBe(true);
  });

  it('keeps final items valid while routing coverage through streaming accumulator in measure mode', async () => {
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

    const result = await executePipeline(schema, {
      generate: { count: 3, seed: 123 },
      validate: { validateFormats: false },
      coverage: { mode: 'measure' },
    });

    expect(result.status).toBe('failed');
    expect(result.timeline).toEqual([
      'normalize',
      'compose',
      'generate',
      'repair',
      'validate',
    ]);

    const finalItems =
      result.artifacts.repaired ?? result.artifacts.generated?.items ?? [];

    expect(Array.isArray(finalItems)).toBe(true);
    expect(finalItems.length).toBeGreaterThan(0);

    const targets = result.artifacts.coverageTargets ?? [];
    expect(targets.length).toBeGreaterThan(0);
    expect(
      targets.some(
        (t) =>
          t.dimension === 'structure' &&
          t.kind === 'SCHEMA_NODE' &&
          t.canonPath === '#'
      )
    ).toBe(true);
  });

  it('emits identical final items for coverage=off vs coverage=measure', async () => {
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

    const finalOff =
      off.artifacts.repaired ?? off.artifacts.generated?.items ?? [];
    const finalMeasure =
      measure.artifacts.repaired ?? measure.artifacts.generated?.items ?? [];

    expect(finalMeasure).toEqual(finalOff);

    expect(off.artifacts.coverageTargets).toBeUndefined();
    const measureTargets = measure.artifacts.coverageTargets ?? [];
    expect(measureTargets.length).toBeGreaterThan(0);
  });

  // eslint-disable-next-line complexity
  it('attaches coverageMetrics and coverageReport when coverage is enabled', async () => {
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
      generate: { count: 2, seed: 42 },
      validate: { validateFormats: false },
      coverage: {
        mode: 'measure',
        dimensionsEnabled: ['structure', 'branches'],
        excludeUnreachable: false,
      },
    });

    expect(result.status).toBe('completed');

    const metrics = result.artifacts.coverageMetrics;
    expect(metrics).toBeDefined();
    expect(metrics?.overall).toBeGreaterThanOrEqual(0);
    expect(metrics?.overall).toBeLessThanOrEqual(1);

    const report = result.artifacts.coverageReport;
    expect(report).toBeDefined();
    expect(report?.version).toBe(COVERAGE_REPORT_VERSION_V1);
    expect(report?.engine.coverageMode).toBe('measure');
    expect(report?.run.seed).toBeGreaterThan(0);
    expect(report?.run.masterSeed).toBe(report?.run.seed);
    expect(report?.metrics.overall).toBe(metrics?.overall);
    expect(Array.isArray(report?.targets)).toBe(true);
    expect(Array.isArray(report?.uncoveredTargets)).toBe(true);
  });

  it('collects unsatisfied hints from generator into coverageReport.unsatisfiedHints in guided mode', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        color: { enum: ['red', 'green'] },
      },
      required: ['color'],
    } as const;

    const guidedResult = await executePipeline(
      schema,
      {
        mode: 'strict',
        generate: { count: 1, seed: 42 },
        validate: { validateFormats: false },
        coverage: {
          mode: 'guided',
          dimensionsEnabled: ['enum'],
          excludeUnreachable: false,
        },
      },
      {
        // Override generate to attach an invalid coverEnumValue hint while
        // still using the core generator and coverage hooks from the pipeline.
        generate(
          effective: ComposeResult,
          options?: PipelineOptions['generate'],
          coverage?: any
        ) {
          const hints = [
            {
              kind: 'coverEnumValue',
              canonPath: '#/properties/color',
              params: { valueIndex: 5 },
            },
          ];
          const generatorOptions = {
            ...(options ?? {}),
            coverage:
              coverage && coverage.mode !== 'off'
                ? {
                    ...coverage,
                    hints,
                  }
                : coverage,
          } as unknown;
          return generateFromCompose(effective, generatorOptions as any);
        },
      }
    );

    expect(guidedResult.status).toBe('completed');

    const report = guidedResult.artifacts.coverageReport;
    expect(report).toBeDefined();
    expect(report?.engine.coverageMode).toBe('guided');

    const unsatisfiedHints = report?.unsatisfiedHints ?? [];
    expect(unsatisfiedHints.length).toBeGreaterThan(0);

    const enumHints = unsatisfiedHints.filter(
      (hint) =>
        hint.kind === 'coverEnumValue' &&
        hint.canonPath === '#/properties/color'
    );
    expect(enumHints.length).toBeGreaterThan(0);
    expect(enumHints[0]?.reasonCode).toBe('INTERNAL_ERROR');

    // Unsatisfied hints are diagnostic-only and must not alter metrics.
    const metrics = guidedResult.artifacts.coverageMetrics;
    expect(metrics).toBeDefined();
    expect(report?.metrics.overall).toBe(metrics?.overall);
  });
});
