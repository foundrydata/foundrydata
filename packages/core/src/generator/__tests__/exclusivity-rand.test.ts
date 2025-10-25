/* eslint-disable complexity */
import { describe, expect, it } from 'vitest';

import { normalize } from '../../transform/schema-normalizer';
import {
  compose,
  type NodeDiagnostics,
} from '../../transform/composition-engine';
import { generateFromCompose } from '../foundry-generator';
import { DIAGNOSTIC_CODES } from '../../diag/codes';

function composeSchema(schema: unknown): ReturnType<typeof compose> {
  return compose(normalize(schema));
}

function forceRootBranchIndex(
  result: ReturnType<typeof compose>,
  index: number
): void {
  result.diag ??= {};
  const nodes = (result.diag.nodes ?? {}) as Record<string, NodeDiagnostics>;
  const existing = nodes[''] ?? {};
  const defaultScoreDetails: NodeDiagnostics['scoreDetails'] =
    existing.scoreDetails ?? {
      orderedIndices: [],
      topScoreIndices: [],
      topKIndices: [],
      scoresByIndex: {},
    };
  nodes[''] = {
    ...existing,
    chosenBranch: {
      index,
      score: existing.chosenBranch?.score ?? 0,
    },
    scoreDetails: defaultScoreDetails,
  } as NodeDiagnostics;
  const branchCanonPath =
    result.diag?.branchDecisions?.find((entry) =>
      entry.canonPath.endsWith('/oneOf')
    )?.canonPath ?? '/oneOf';
  if (!nodes[branchCanonPath]) {
    const base = nodes[''];
    nodes[branchCanonPath] = base
      ? {
          ...base,
          scoreDetails: {
            ...(base.scoreDetails ?? {
              orderedIndices: [],
              topScoreIndices: [],
              topKIndices: [],
              scoresByIndex: {},
            }),
          },
        }
      : nodes[''];
  }
  result.diag.nodes = nodes;
}

function rootNode(
  eff: ReturnType<typeof compose>
): NodeDiagnostics | undefined {
  return (eff.diag?.nodes ?? {})[''];
}

describe('Generator exclusivity tweaks', () => {
  const overlappingSchema = {
    oneOf: [
      { type: 'string', minLength: 1, pattern: '^-.*' },
      { type: 'string', minLength: 1, pattern: '^-+$' },
    ],
  } as const;

  it('injects \u0000 when string tweaks are required and omits RNG evidence by default', () => {
    const eff = composeSchema(overlappingSchema);
    forceRootBranchIndex(eff, 0);
    const out = generateFromCompose(eff, { sourceSchema: overlappingSchema });

    const item = out.items[0];
    expect(typeof item).toBe('string');
    expect(item).toBe(`-\u0000`);

    const diag = out.diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.EXCLUSIVITY_TWEAK_STRING
    );
    expect(diag).toBeDefined();
    expect(diag?.details).toEqual({ char: '\u0000' });
    expect(diag?.scoreDetails?.exclusivityRand).toBeUndefined();
  });

  it('honors conditionals.exclusivityStringTweak preferences', () => {
    const eff = composeSchema(overlappingSchema);
    forceRootBranchIndex(eff, 0);
    const out = generateFromCompose(eff, {
      sourceSchema: overlappingSchema,
      planOptions: { conditionals: { exclusivityStringTweak: 'preferAscii' } },
    });

    const item = out.items[0];
    expect(item).toBe('-a');

    const diag = out.diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.EXCLUSIVITY_TWEAK_STRING
    );
    expect(diag?.details).toEqual({ char: 'a' });
    expect(diag?.scoreDetails?.exclusivityRand).toBeUndefined();
  });

  it('nudges numeric values by epsilon to keep the chosen branch exclusive', () => {
    const schema = {
      oneOf: [
        {
          type: 'number',
          minimum: 0.2,
          maximum: 10,
        },
        {
          type: 'number',
          const: 0.2,
        },
      ],
    } as const;

    const eff = composeSchema(schema);
    forceRootBranchIndex(eff, 0);
    const out = generateFromCompose(eff, { sourceSchema: schema });

    const value = out.items[0] as number;
    expect(value).toBeGreaterThan(0.2);
    expect(value).toBeLessThan(0.200001);
    expect(value).toBeCloseTo(0.2 + 1e-12, 6);
    expect(
      out.diagnostics.some(
        (d) => d.code === DIAGNOSTIC_CODES.EXCLUSIVITY_TWEAK_STRING
      )
    ).toBe(false);
  });

  it('respects branch multipleOf when numeric exclusivity tweaks run', () => {
    const schema = {
      oneOf: [
        {
          type: 'number',
          minimum: 0,
          maximum: 1,
          multipleOf: 0.05,
        },
        {
          type: 'number',
          const: 0,
        },
      ],
    } as const;

    const eff = composeSchema(schema);
    forceRootBranchIndex(eff, 0);
    const out = generateFromCompose(eff, { sourceSchema: schema });

    const value = out.items[0] as number;
    expect(value).toBeGreaterThan(0);
    expect(value).toBeCloseTo(0.05, 6);
    const ratio = value / 0.05;
    expect(ratio).toBeCloseTo(Math.round(ratio), 6);
  });

  it('tweaks nested string properties to break conflicting branches', () => {
    const schema = {
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['payload'],
          properties: {
            payload: { type: 'string', minLength: 1 },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['payload'],
          properties: {
            payload: { const: '-' },
          },
        },
      ],
    } as const;

    const eff = composeSchema(schema);
    forceRootBranchIndex(eff, 0);
    const out = generateFromCompose(eff, { sourceSchema: schema });

    const item = out.items[0] as { payload: string };
    expect(item.payload).toBe('-\u0000');

    const diag = out.diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.EXCLUSIVITY_TWEAK_STRING
    );
    expect(diag).toBeDefined();
    expect(diag?.details).toEqual({ char: '\u0000' });
  });

  it('tweaks nested integer properties using schema-aware steps', () => {
    const schema = {
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['count', 'marker'],
          properties: {
            count: { type: 'integer', multipleOf: 2, minimum: 0 },
            marker: { const: 'alpha' },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['count', 'marker'],
          properties: {
            count: { const: 0 },
            marker: { const: 'alpha' },
          },
        },
      ],
    } as const;

    const eff = composeSchema(schema);
    forceRootBranchIndex(eff, 0);
    const out = generateFromCompose(eff, { sourceSchema: schema });

    const item = out.items[0] as { count: number; marker: string };
    expect(item.marker).toBe('alpha');
    expect(item.count).toBeGreaterThan(0);
    expect(item.count % 2).toBe(0);
    const diag = out.diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.EXCLUSIVITY_TWEAK_STRING
    );
    expect(diag).toBeUndefined();
  });

  it('records exclusivityRand when the preferred branch no longer passes', () => {
    const canonical = {
      oneOf: [
        {
          type: 'string',
          const: 'alpha',
        },
        {
          type: 'string',
          minLength: 1,
        },
      ],
    } as const;

    const sourceSchema = {
      oneOf: [
        {
          type: 'string',
          const: 'alpha',
          pattern: '^beta$',
        },
        canonical.oneOf[1],
      ],
    } as const;

    const eff = composeSchema(canonical);
    forceRootBranchIndex(eff, 0);
    const out = generateFromCompose(eff, {
      sourceSchema,
      seed: 1234,
    });

    expect(out.items[0]).toBe('alpha');
    const node = rootNode(eff);
    expect(node?.scoreDetails?.exclusivityRand).toBeDefined();
    const rand = node?.scoreDetails?.exclusivityRand as number;
    expect(rand).toBeGreaterThanOrEqual(0);
    expect(rand).toBeLessThan(1);
  });

  it('populates scoreDetails when Compose omitted them', () => {
    const canonical = {
      oneOf: [
        {
          type: 'string',
          const: 'alpha',
        },
        {
          type: 'string',
          minLength: 1,
        },
      ],
    } as const;

    const sourceSchema = {
      oneOf: [
        {
          type: 'string',
          const: 'alpha',
          pattern: '^beta$',
        },
        canonical.oneOf[1],
      ],
    } as const;

    const eff = composeSchema(canonical);
    forceRootBranchIndex(eff, 0);
    if (eff.diag?.nodes?.['']) {
      delete eff.diag.nodes['']!.scoreDetails;
    }
    const out = generateFromCompose(eff, {
      sourceSchema,
      seed: 5678,
    });

    expect(out.items[0]).toBe('alpha');
    const node = rootNode(eff);
    expect(node?.scoreDetails).toMatchObject({
      orderedIndices: [],
      topScoreIndices: [],
      topKIndices: [],
      scoresByIndex: {},
    });
    expect(typeof node?.scoreDetails?.exclusivityRand).toBe('number');
    expect(node?.scoreDetails?.exclusivityRand).toBeGreaterThanOrEqual(0);
    expect(node?.scoreDetails?.exclusivityRand).toBeLessThan(1);
  });

  it('reselects when the preferred branch cannot be isolated but still passes', () => {
    const schema = {
      oneOf: [{ const: 'alpha' }, { type: 'string', minLength: 1 }],
    } as const;

    const eff = composeSchema(schema);
    forceRootBranchIndex(eff, 0);
    const out = generateFromCompose(eff, { sourceSchema: schema, seed: 77 });

    expect(out.items[0]).toBe('alpha\u0000');
    const diag = out.diagnostics.find(
      (entry) => entry.code === DIAGNOSTIC_CODES.EXCLUSIVITY_TWEAK_STRING
    );
    expect(diag).toBeDefined();
    expect(diag?.details).toEqual({ char: '\u0000' });
    const node = rootNode(eff);
    expect(node?.scoreDetails?.exclusivityRand).toBeDefined();
  });

  it('derives exclusivityRand deterministically from the seed and canonPath', () => {
    const schema = {
      oneOf: [{ const: 'alpha' }, { type: 'string', minLength: 1 }],
    } as const;

    const computeRand = (seed: number): number | undefined => {
      const eff = composeSchema(schema);
      forceRootBranchIndex(eff, 0);
      generateFromCompose(eff, { sourceSchema: schema, seed });
      return rootNode(eff)?.scoreDetails?.exclusivityRand ?? undefined;
    };

    const first = computeRand(77);
    const second = computeRand(77);
    const third = computeRand(99);

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(third).toBeDefined();
    expect(first).toBeCloseTo(second as number, 12);
    expect(Math.abs((third as number) - (first as number))).toBeGreaterThan(
      Number.EPSILON
    );
  });
});
