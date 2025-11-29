import { describe, expect, it } from 'vitest';

import {
  Compose as PublicCompose,
  Generate as PublicGenerate,
  Normalize as PublicNormalize,
  Validate as PublicValidate,
  type NormalizeApiResult,
} from '../../src/index.js';
import { composeEffective, normalizeSchema } from './test-helpers.js';

describe('Node API — Normalize', () => {
  it('returns canonSchema, ptrMap and notes without mutating the original schema', () => {
    const schema = {
      allOf: [true, { type: 'string', title: 'S' }, true],
    };
    const original = JSON.parse(JSON.stringify(schema));

    const direct = normalizeSchema(schema);
    const apiResult: NormalizeApiResult = PublicNormalize(schema);

    expect(schema).toEqual(original);
    expect(apiResult.canonSchema).toEqual(direct.schema);
    expect(apiResult.ptrMap).toEqual(Object.fromEntries(direct.ptrMap));
    expect(apiResult.notes.map((n) => n.code)).toEqual(
      direct.notes.map((n) => n.code)
    );
  });
});

describe('Node API — Compose', () => {
  // eslint-disable-next-line complexity
  it('produces coverageIndex compatible with composition engine', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      patternProperties: {
        '^(?:a|b)$': {},
      },
    };

    const { canonical } = composeEffective(schema);
    const apiResult = PublicCompose(schema, {
      mode: 'strict',
    });

    const directEntry = canonical.coverageIndex.get('');
    const apiEntry = apiResult.coverageIndex.get('');

    expect(apiEntry).toBeDefined();
    expect(apiEntry?.provenance).toEqual(directEntry?.provenance);
    expect(apiEntry?.enumerate?.()).toEqual(directEntry?.enumerate?.());
    expect(apiEntry?.has('a')).toBe(true);
    expect(apiEntry?.has('b')).toBe(true);

    const directDiagCodes = [
      ...(canonical.diag?.fatal ?? []),
      ...(canonical.diag?.warn ?? []),
      ...(canonical.diag?.unsatHints ?? []),
      ...(canonical.diag?.run ?? []),
    ].map((d) => d.code);
    const apiDiagCodes = apiResult.planDiag.map((d) => d.code);

    expect(new Set(apiDiagCodes)).toEqual(new Set(directDiagCodes));
  });
});

describe('Node API — Generate & Validate', () => {
  const simpleSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'integer' },
      name: { type: 'string' },
    },
    required: ['id', 'name'],
  };

  const coverageSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    oneOf: [
      {
        type: 'object',
        properties: {
          branch: { const: 'a' },
        },
        required: ['branch'],
      },
      {
        type: 'object',
        properties: {
          branch: { const: 'b' },
        },
        required: ['branch'],
      },
    ],
  } as const;

  it('Generate+Validate produce only AJV-valid instances for a simple schema', async () => {
    const count = 5;
    const seed = 4242;

    const stream = PublicGenerate(count, seed, simpleSchema, {
      mode: 'strict',
    });
    const pipelineResult = await stream.result;

    expect(pipelineResult.status).toBe('completed');
    const generatedStage = pipelineResult.stages.generate.output;
    const repairedItems = pipelineResult.artifacts.repaired;
    const items = Array.isArray(repairedItems)
      ? repairedItems
      : (generatedStage?.items ?? []);

    expect(items).toHaveLength(count);

    for (const item of items) {
      const res = PublicValidate(item, simpleSchema);
      expect(res.valid).toBe(true);
      if (res.ajvErrors && res.ajvErrors.length > 0) {
        // ValidationResult should not include AJV errors for valid instances
        throw new Error(
          `Expected no AJV errors, got ${JSON.stringify(res.ajvErrors)}`
        );
      }
    }
  });

  it('Generate is deterministic for the same schema, seed and count', async () => {
    const count = 4;
    const seed = 777;

    const firstRun = await PublicGenerate(count, seed, simpleSchema, {
      mode: 'strict',
    }).result;
    const secondRun = await PublicGenerate(count, seed, simpleSchema, {
      mode: 'strict',
    }).result;

    const firstItems = Array.isArray(firstRun.artifacts.repaired)
      ? firstRun.artifacts.repaired
      : (firstRun.artifacts.generated?.items ?? []);
    const secondItems = Array.isArray(secondRun.artifacts.repaired)
      ? secondRun.artifacts.repaired
      : (secondRun.artifacts.generated?.items ?? []);

    expect(firstItems).toEqual(secondItems);
  });

  it('returns coverageStatus and thresholds when minCoverage is configured', async () => {
    const stream = PublicGenerate(1, 512, coverageSchema, {
      mode: 'strict',
      coverage: {
        mode: 'measure',
        dimensionsEnabled: ['branches'],
        minCoverage: 0.9,
      },
    });
    const pipelineResult = await stream.result;
    expect(pipelineResult.status).toBe('completed');
    const coverageReport = pipelineResult.artifacts.coverageReport;
    expect(coverageReport).toBeDefined();
    expect(coverageReport?.metrics.coverageStatus).toBe('minCoverageNotMet');
    expect(coverageReport?.metrics.thresholds?.overall).toBe(0.9);
    expect(coverageReport?.metrics.overall ?? 1).toBeLessThan(0.9);
  });

  it('enforces minCoverage for guided mode runs as well', async () => {
    const stream = PublicGenerate(1, 31415, coverageSchema, {
      mode: 'strict',
      coverage: {
        mode: 'guided',
        dimensionsEnabled: ['branches'],
        minCoverage: 0.95,
      },
    });
    const pipelineResult = await stream.result;

    expect(pipelineResult.status).toBe('completed');
    const coverageReport = pipelineResult.artifacts.coverageReport;
    expect(coverageReport).toBeDefined();
    expect(coverageReport?.metrics.coverageStatus).toBe('minCoverageNotMet');
    expect(coverageReport?.metrics.thresholds?.overall).toBe(0.95);
    expect(coverageReport?.metrics.overall ?? 1).toBeLessThan(0.95);
  });
});
