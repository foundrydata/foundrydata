import { describe, expect, it } from 'vitest';

import { normalize } from '../../transform/schema-normalizer';
import { compose } from '../../transform/composition-engine';
import { generateFromCompose } from '../foundry-generator';

function composeSchema(schema: unknown): ReturnType<typeof compose> {
  const normalized = normalize(schema);
  return compose(normalized);
}

describe('Source AJV dialect selection', () => {
  it('uses draft-07 when $schema is draft-07 (E-Trace anyOf)', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      unevaluatedProperties: false,
      additionalProperties: false,
      required: ['kind'],
      properties: { kind: { enum: ['A', 'B'] } },
      patternProperties: { '^aa$': { const: 1 } },
      anyOf: [
        {
          properties: { kind: { const: 'A' }, aa: { const: 1 } },
          required: ['kind'],
        },
        { properties: { kind: { const: 'B' } }, required: ['kind'] },
      ],
      minProperties: 2,
    } as const;

    const eff = composeSchema(schema);
    const out = generateFromCompose(eff, {
      sourceSchema: schema,
      planOptions: {
        patternWitness: { alphabet: 'ab', maxLength: 2, maxCandidates: 32 },
      },
    });

    expect(out.items).toHaveLength(1);
    const obj = out.items[0] as Record<string, unknown>;
    expect(obj.kind).toBe('A');
    expect(Object.keys(obj)).toContain('aa');
  });
});
