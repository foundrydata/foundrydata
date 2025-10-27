import { describe, expect, it } from 'vitest';

import { normalize } from '../../transform/schema-normalizer';
import { compose } from '../../transform/composition-engine';
import { generateFromCompose } from '../foundry-generator';

function composeSchema(schema: unknown): ReturnType<typeof compose> {
  const normalized = normalize(schema);
  return compose(normalized);
}

describe('E-Trace anyOf gating under unevaluatedProperties:false', () => {
  it('allows names evaluated via matching anyOf branch when using Source AJV', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      unevaluatedProperties: false,
      additionalProperties: false,
      required: ['kind'],
      properties: {
        kind: { enum: ['A', 'B'] },
      },
      // Candidate names are supplied via anchored-safe patternProperties
      patternProperties: {
        '^aa$': { const: 1 },
        '^bb$': { const: 2 },
      },
      anyOf: [
        {
          properties: { kind: { const: 'A' }, aa: { const: 1 } },
          required: ['kind'],
        },
        {
          properties: { kind: { const: 'B' }, bb: { const: 2 } },
          required: ['kind'],
        },
      ],
      minProperties: 2,
    } as const;

    const eff = composeSchema(schema);
    const out = generateFromCompose(eff, {
      // Provide Source schema to enable dynamic anyOf evaluation (E-Trace)
      sourceSchema: schema,
      // Keep pattern witness domain tight to reach literals quickly
      planOptions: {
        patternWitness: {
          alphabet: 'ab',
          maxLength: 2,
          maxCandidates: 64,
        },
      },
    });

    expect(out.items).toHaveLength(1);
    const obj = out.items[0] as Record<string, unknown>;
    const branchPtr = '/anyOf';
    const chosen = eff.diag?.nodes?.[branchPtr]?.chosenBranch?.index ?? 0;
    const branch = schema.anyOf[chosen] ?? schema.anyOf[0];
    const expectedKind = (
      branch as {
        properties: { kind: { const: string } };
      }
    ).properties.kind.const;
    expect(obj.kind).toBe(expectedKind);
    if (expectedKind === 'A') {
      expect(Object.keys(obj)).toContain('aa');
      expect(Object.keys(obj)).not.toContain('bb');
    } else {
      expect(Object.keys(obj)).toContain('bb');
      expect(Object.keys(obj)).not.toContain('aa');
    }
  });
});
