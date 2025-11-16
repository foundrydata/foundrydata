import * as Core from '@foundrydata/core';
import type { ComposeResult, PipelineResult } from '@foundrydata/core';
import { DIAGNOSTIC_PHASES } from '@foundrydata/core/dist/diag/codes.js';
import { describe, expect, it, vi } from 'vitest';

import { runEngineOnSchema } from './runner.js';

const schemaFixture = {
  $id: 'https://example.com/schema',
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    active: { type: 'boolean' },
  },
  required: ['id', 'name'],
};

describe('runEngineOnSchema', () => {
  it('returns a pipeline-backed report with coverage/metrics/summary populated', async () => {
    const report = await runEngineOnSchema({
      schema: schemaFixture,
      schemaId: 'example-schema',
      schemaPath: '/tmp/example-schema.json',
      seed: 7,
    });

    expect(report.planOptions).toEqual({});
    expect(report.meta.toolName).toBe('json-schema-reporter');
    expect(report.meta.engineVersion).toBeDefined();
    expect(report.instances.length).toBe(report.summary.totalInstances);
    expect(report.instances.length).toBeGreaterThan(0);
    expect(report.compose?.coverageIndexSnapshot?.length).toBeGreaterThan(0);
    expect(report.compose?.coverageIndexSnapshot?.[0]?.canonPath).toBe('#');
    expect(report.repair?.actions).toEqual([]);
    expect(report.validate?.errors).toEqual([]);
    expect(report.metrics?.normalizeMs).toBeGreaterThanOrEqual(0);
  });

  it('respects the maxInstances cap', async () => {
    const report = await runEngineOnSchema({
      schema: schemaFixture,
      schemaId: 'example-schema',
      schemaPath: '/tmp/example-schema.json',
      maxInstances: 2,
    });

    expect(report.repair?.actions).toHaveLength(0);
    expect(report.validate?.errors).toHaveLength(0);
    expect(report.instances).toHaveLength(2);
    expect(report.summary.totalInstances).toBe(2);
  });

  it('adapts repair actions and validation errors from pipeline artifacts', async () => {
    const normalizeResult = {
      schema: schemaFixture,
      ptrMap: new Map<string, string>(),
      revPtrMap: new Map<string, string[]>(),
      notes: [],
    };
    const coverageEntry = {
      has: () => true,
      enumerate: () => ['id'],
      provenance: ['properties'],
    };
    const composeResult = {
      canonical: normalizeResult,
      containsBag: new Map(),
      coverageIndex: new Map([['', coverageEntry]]),
      diag: {
        fatal: [],
        warn: [],
        unsatHints: [],
        run: [],
      },
    } as unknown as ComposeResult;
    const generated = {
      items: [{ id: 1 }],
      diagnostics: [
        {
          code: 'TRIALS_SKIPPED_SCORE_ONLY',
          canonPath: '#',
          details: { reason: 'skipTrialsFlag' },
          phase: DIAGNOSTIC_PHASES.GENERATE,
        },
      ],
      metrics: {},
      seed: 99,
    };
    const repaired = [{ id: 1, renamed: true }];
    const mockResult: PipelineResult = {
      status: 'completed',
      schema: schemaFixture,
      stages: {
        normalize: { status: 'completed', output: normalizeResult },
        compose: { status: 'completed', output: composeResult },
        generate: { status: 'completed', output: generated },
        repair: { status: 'completed', output: repaired },
        validate: { status: 'completed', output: { valid: true } },
      },
      metrics: {
        normalizeMs: 1,
        composeMs: 1,
        generateMs: 1,
        repairMs: 1,
        validateMs: 1,
        validationsPerRow: 1,
        repairPassesPerRow: 1,
        memoryPeakMB: 1,
        p50LatencyMs: 1,
        p95LatencyMs: 1,
      },
      timeline: [],
      errors: [],
      artifacts: {
        canonical: normalizeResult,
        effective: composeResult,
        generated,
        repaired,
        repairActions: [
          {
            action: 'renameProperty',
            canonPath: '#/properties/name',
            instancePath: '/0/name',
            origPath: '#/properties/n',
            details: { from: 'n', to: 'name' },
          },
        ],
        validation: {
          valid: true,
          errors: [
            [
              {
                keyword: 'minimum',
                instancePath: '/0/age',
                schemaPath: '#/properties/age/minimum',
                params: { limit: 18 },
              },
            ],
          ],
        },
      },
    } as PipelineResult;

    const spy = vi.spyOn(Core, 'executePipeline').mockResolvedValue(mockResult);
    const report = await runEngineOnSchema({
      schema: schemaFixture,
      schemaId: 'mock',
      schemaPath: '/tmp/mock.json',
    });
    expect(report.repair?.actions?.length).toBe(1);
    expect(report.instances[0]?.outcome).toBe('valid-repaired');
    expect(report.validate?.errors?.length).toBe(1);
    spy.mockRestore();
  });
});
