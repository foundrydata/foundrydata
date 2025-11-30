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
  it('keeps branches coverage in guided >= measure on a three-branch oneOf schema and exposes uncovered ONEOF_BRANCH targets', async () => {
    const baseOptions = {
      mode: 'strict' as const,
      generate: { count: 48, seed: 2024 } as const,
      validate: { validateFormats: false } as const,
    } as const;

    const measureResult = await executePipeline(oneOfAcceptanceSchema, {
      ...baseOptions,
      coverage: {
        mode: 'measure' as const,
        dimensionsEnabled: ['branches'] as const,
      },
    });

    const guidedResult = await executePipeline(oneOfAcceptanceSchema, {
      ...baseOptions,
      coverage: {
        mode: 'guided' as const,
        dimensionsEnabled: ['branches'] as const,
      },
    });

    expect(measureResult.status).toBe('completed');
    expect(guidedResult.status).toBe('completed');

    const measureReport = measureResult.artifacts.coverageReport;
    const guidedReport = guidedResult.artifacts.coverageReport;
    expect(measureReport).toBeDefined();
    expect(guidedReport).toBeDefined();

    const measureBranches = measureReport!.metrics.byDimension['branches'] ?? 0;
    const guidedBranches = guidedReport!.metrics.byDimension['branches'] ?? 0;

    // Non-regression guided vs measure on branches.
    expect(guidedBranches).toBeGreaterThanOrEqual(measureBranches);

    const guidedBranchTargets =
      guidedReport?.targets.filter(
        (target) =>
          target.dimension === 'branches' && target.kind === 'ONEOF_BRANCH'
      ) ?? [];

    // There should be exactly three ONEOF_BRANCH targets for the three branches.
    expect(guidedBranchTargets.length).toBe(3);

    guidedBranchTargets.forEach((target) => {
      expect(typeof target.hit).toBe('boolean');
      expect(target.status === undefined || target.status === 'active').toBe(
        true
      );
    });

    const uncovered = guidedReport!.uncoveredTargets ?? [];
    const uncoveredIds = new Set(uncovered.map((t) => t.id));

    // Any ONEOF_BRANCH target that is not hit in guided mode must appear in uncoveredTargets.
    guidedBranchTargets
      .filter((target) => !target.hit)
      .forEach((target) => {
        expect(uncoveredIds.has(target.id)).toBe(true);
      });
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

  it('keeps enum coverage in guided >= measure on a four-value enum and exposes uncovered ENUM_VALUE_HIT targets', async () => {
    const baseOptions = {
      mode: 'strict' as const,
      generate: { count: 16, seed: 777 } as const,
      validate: { validateFormats: false } as const,
    } as const;

    const measureResult = await executePipeline(enumAcceptanceSchema, {
      ...baseOptions,
      coverage: {
        mode: 'measure' as const,
        dimensionsEnabled: ['enum'] as const,
      },
    });

    const guidedResult = await executePipeline(enumAcceptanceSchema, {
      ...baseOptions,
      coverage: {
        mode: 'guided' as const,
        dimensionsEnabled: ['enum'] as const,
      },
    });

    expect(measureResult.status).toBe('completed');
    expect(guidedResult.status).toBe('completed');

    const measureReport = measureResult.artifacts.coverageReport;
    const guidedReport = guidedResult.artifacts.coverageReport;
    expect(measureReport).toBeDefined();
    expect(guidedReport).toBeDefined();

    const measureEnum = measureReport!.metrics.byDimension['enum'] ?? 0;
    const guidedEnum = guidedReport!.metrics.byDimension['enum'] ?? 0;

    // Non-regression guided vs measure on enum.
    expect(guidedEnum).toBeGreaterThanOrEqual(measureEnum);

    const enumTargets =
      guidedReport?.targets.filter(
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

    const uncovered = guidedReport!.uncoveredTargets ?? [];
    const uncoveredIds = new Set(uncovered.map((t) => t.id));

    // Any ENUM_VALUE_HIT target that is not hit in guided mode must appear in uncoveredTargets.
    enumTargets
      .filter((target) => !target.hit)
      .forEach((target) => {
        expect(uncoveredIds.has(target.id)).toBe(true);
      });
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
