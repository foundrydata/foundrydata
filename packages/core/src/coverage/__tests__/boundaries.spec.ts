import { describe, it, expect } from 'vitest';

import type { CoverageReport } from '@foundrydata/shared';
import { executePipeline } from '../../pipeline/orchestrator.js';

describe('coverage boundaries semantics (M2)', () => {
  it('marks inclusive numeric, string and array boundaries as hit when representatives are emitted', async () => {
    const schema = {
      type: 'object',
      properties: {
        num: { type: 'integer', minimum: 0, maximum: 0 },
        str: { type: 'string', minLength: 3, maxLength: 3 },
        arr: {
          type: 'array',
          minItems: 2,
          maxItems: 2,
          items: { type: 'integer', minimum: 1, maximum: 1 },
        },
      },
      required: ['num', 'str', 'arr'],
    } as const;

    const result = await executePipeline(schema, {
      mode: 'strict',
      generate: {
        count: 1,
        seed: 1,
      },
      coverage: {
        mode: 'measure',
        dimensionsEnabled: ['boundaries'],
      },
      validate: {
        validateFormats: false,
      },
    });

    const coverage = result.artifacts.coverageReport as
      | CoverageReport
      | undefined;
    expect(coverage).toBeDefined();
    const { targets, metrics } = coverage!;

    const boundariesRatio = metrics.byDimension.boundaries;
    expect(boundariesRatio).toBeGreaterThan(0);

    const numTargets = targets.filter(
      (t) => t.dimension === 'boundaries' && t.canonPath === '#/properties/num'
    );
    const strTargets = targets.filter(
      (t) => t.dimension === 'boundaries' && t.canonPath === '#/properties/str'
    );
    const arrTargets = targets.filter(
      (t) => t.dimension === 'boundaries' && t.canonPath === '#/properties/arr'
    );

    expect(numTargets.some((t) => t.kind === 'NUMERIC_MIN_HIT' && t.hit)).toBe(
      true
    );
    expect(numTargets.some((t) => t.kind === 'NUMERIC_MAX_HIT' && t.hit)).toBe(
      true
    );

    expect(
      strTargets.some((t) => t.kind === 'STRING_MIN_LENGTH_HIT' && t.hit)
    ).toBe(true);
    expect(
      strTargets.some((t) => t.kind === 'STRING_MAX_LENGTH_HIT' && t.hit)
    ).toBe(true);

    expect(
      arrTargets.some((t) => t.kind === 'ARRAY_MIN_ITEMS_HIT' && t.hit)
    ).toBe(true);
    expect(
      arrTargets.some((t) => t.kind === 'ARRAY_MAX_ITEMS_HIT' && t.hit)
    ).toBe(true);
  });

  it('covers exclusive numeric boundaries via representative values compatible with multipleOf', async () => {
    const schema = {
      type: 'object',
      properties: {
        num: {
          type: 'number',
          exclusiveMinimum: 0,
          exclusiveMaximum: 5,
          multipleOf: 0.5,
        },
      },
      required: ['num'],
    } as const;

    const result = await executePipeline(schema, {
      mode: 'strict',
      generate: {
        count: 1,
        seed: 2,
      },
      coverage: {
        mode: 'measure',
        dimensionsEnabled: ['boundaries'],
      },
      validate: {
        validateFormats: false,
      },
    });

    const coverage = result.artifacts.coverageReport as
      | CoverageReport
      | undefined;
    expect(coverage).toBeDefined();
    const { targets } = coverage!;

    const numTargets = targets.filter(
      (t) => t.dimension === 'boundaries' && t.canonPath === '#/properties/num'
    );

    expect(
      numTargets.some(
        (t) =>
          t.kind === 'NUMERIC_MIN_HIT' &&
          t.params?.boundaryKind === 'exclusiveMinimum' &&
          t.hit
      )
    ).toBe(true);
    expect(
      numTargets.some(
        (t) =>
          t.kind === 'NUMERIC_MAX_HIT' &&
          t.params?.boundaryKind === 'exclusiveMaximum' &&
          t.hit
      )
    ).toBe(true);
  });
});
