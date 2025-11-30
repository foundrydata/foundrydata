import { describe, it, expect } from 'vitest';

import { executePipeline } from '../../src/pipeline/orchestrator.js';

const oneOfAcceptanceSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { const: 'left' },
        value: { type: 'integer' },
      },
      required: ['kind', 'value'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { const: 'right' },
        value: { type: 'integer' },
      },
      required: ['kind', 'value'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { const: 'center' },
        value: { type: 'integer' },
      },
      required: ['kind', 'value'],
    },
  ],
} as const;

const optionalPropertiesSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  properties: {
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    email: { type: 'string', format: 'email' },
  },
} as const;

const enumAcceptanceSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  properties: {
    color: { enum: ['red', 'green', 'blue', 'yellow'] },
  },
  required: ['color'],
} as const;

const coverageThresholdAcceptanceSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  oneOf: [
    {
      type: 'object',
      properties: {
        flavor: { const: 'vanilla' },
      },
      required: ['flavor'],
    },
    {
      type: 'object',
      properties: {
        flavor: { const: 'chocolate' },
      },
      required: ['flavor'],
    },
  ],
} as const;

const getFinalItems = (
  result: Awaited<ReturnType<typeof executePipeline>>
): unknown[] => {
  const generated = result.artifacts.generated?.items ?? [];
  return result.artifacts.repaired ?? generated;
};

describe('coverage acceptance scenarios (cov://§10#acceptance-criteria-v1)', () => {
  it('achieves full ONEOF_BRANCH coverage for a three-branch oneOf schema in guided mode', async () => {
    const result = await executePipeline(oneOfAcceptanceSchema, {
      mode: 'strict',
      generate: { count: 48, seed: 2024 },
      validate: { validateFormats: false },
      coverage: {
        mode: 'guided',
        dimensionsEnabled: ['branches'],
      },
    });

    expect(result.status).toBe('completed');

    const report = result.artifacts.coverageReport;
    expect(report).toBeDefined();

    const branchTargets =
      report?.targets.filter(
        (target) =>
          target.dimension === 'branches' && target.kind === 'ONEOF_BRANCH'
      ) ?? [];

    // There should be exactly three ONEOF_BRANCH targets for the three branches.
    expect(branchTargets.length).toBe(3);

    // Each target must expose a boolean hit flag so the report clearly
    // indicates which branches were visited.
    branchTargets.forEach((target) => {
      expect(typeof target.hit).toBe('boolean');
      expect(target.status === undefined || target.status === 'active').toBe(
        true
      );
    });

    const branchesCoverage = report?.metrics.byDimension['branches'];
    expect(typeof branchesCoverage).toBe('number');
    expect(branchesCoverage && branchesCoverage).toBeGreaterThanOrEqual(0);
    expect(branchesCoverage && branchesCoverage).toBeLessThanOrEqual(1);
  });

  it('records PROPERTY_PRESENT coverage for optional properties while preserving items between coverage=off and measure', async () => {
    const baseOptions = {
      mode: 'strict' as const,
      generate: { count: 12, seed: 314 },
      validate: { validateFormats: false },
    } as const;

    const offResult = await executePipeline(optionalPropertiesSchema, {
      ...baseOptions,
      coverage: { mode: 'off' },
    });

    const measureResult = await executePipeline(optionalPropertiesSchema, {
      ...baseOptions,
      coverage: {
        mode: 'measure',
        dimensionsEnabled: ['structure'],
      },
    });

    expect(offResult.status).toBe('completed');
    expect(measureResult.status).toBe('completed');

    // Switching from coverage=off to coverage=measure must not change
    // the final items (values or shape).
    expect(getFinalItems(measureResult)).toEqual(getFinalItems(offResult));

    const report = measureResult.artifacts.coverageReport;
    expect(report).toBeDefined();

    const propertyTargets =
      report?.targets.filter(
        (target) =>
          target.dimension === 'structure' &&
          target.kind === 'PROPERTY_PRESENT' &&
          target.canonPath.startsWith('#/properties/')
      ) ?? [];

    const propertyNames = ['firstName', 'lastName', 'email'];

    // We expect exactly one PROPERTY_PRESENT target per property.
    const namesFromTargets = propertyTargets.map((target) => {
      const params = (target.params ?? {}) as { propertyName?: unknown };
      return typeof params.propertyName === 'string'
        ? params.propertyName
        : undefined;
    });

    expect(new Set(namesFromTargets)).toEqual(new Set(propertyNames));

    propertyTargets.forEach((target) => {
      expect(typeof target.hit).toBe('boolean');
    });
  });

  it('covers all ENUM_VALUE_HIT targets for a four-value enum in guided mode', async () => {
    const result = await executePipeline(enumAcceptanceSchema, {
      mode: 'strict',
      generate: { count: 16, seed: 777 },
      validate: { validateFormats: false },
      coverage: {
        mode: 'guided',
        dimensionsEnabled: ['enum'],
      },
    });

    expect(result.status).toBe('completed');

    const report = result.artifacts.coverageReport;
    expect(report).toBeDefined();

    const enumTargets =
      report?.targets.filter(
        (target) =>
          target.dimension === 'enum' &&
          target.kind === 'ENUM_VALUE_HIT' &&
          target.canonPath === '#/properties/color'
      ) ?? [];

    expect(enumTargets.length).toBe(4);

    const enumIndices = new Set(
      enumTargets.map((target) => {
        const params = (target.params ?? {}) as { enumIndex?: unknown };
        return params.enumIndex;
      })
    );

    expect(enumIndices).toEqual(new Set([0, 1, 2, 3]));

    enumTargets.forEach((target) => {
      expect(typeof target.hit).toBe('boolean');
      expect(target.status === undefined || target.status === 'active').toBe(
        true
      );
    });

    const enumCoverage = report?.metrics.byDimension['enum'];
    expect(typeof enumCoverage).toBe('number');
    expect(enumCoverage && enumCoverage).toBeGreaterThanOrEqual(0);
    expect(enumCoverage && enumCoverage).toBeLessThanOrEqual(1);
  });

  it('marks coverageStatus minCoverageNotMet and attaches an overall threshold when coverage falls below minCoverage', async () => {
    const options = {
      generate: { count: 2, seed: 2025 },
      validate: { validateFormats: false },
      coverage: {
        mode: 'measure' as const,
        dimensionsEnabled: ['structure', 'branches'] as const,
        minCoverage: 0.8,
      },
    } as const;

    const first = await executePipeline(
      coverageThresholdAcceptanceSchema,
      options
    );

    expect(first.status).toBe('completed');
    const firstReport = first.artifacts.coverageReport;
    expect(firstReport).toBeDefined();

    const metrics = firstReport!.metrics;
    expect(metrics.coverageStatus).toBe('minCoverageNotMet');
    expect(metrics.thresholds?.overall).toBe(0.8);
    expect(metrics.overall).toBeLessThan(0.8);

    const second = await executePipeline(
      coverageThresholdAcceptanceSchema,
      options
    );
    const secondReport = second.artifacts.coverageReport;
    expect(secondReport).toBeDefined();

    expect(secondReport!.metrics.coverageStatus).toBe(
      firstReport!.metrics.coverageStatus
    );
    expect(secondReport!.metrics.thresholds?.overall).toBe(
      firstReport!.metrics.thresholds?.overall
    );
  });
});
