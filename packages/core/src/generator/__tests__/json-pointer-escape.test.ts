import { describe, expect, it } from 'vitest';

import { normalize } from '../../transform/schema-normalizer';
import { compose } from '../../transform/composition-engine';
import { generateFromCompose } from '../foundry-generator';

function composeSchema(schema: unknown): ReturnType<typeof compose> {
  const normalized = normalize(schema);
  return compose(normalized);
}

describe('JSON Pointer escaping/unescaping integration', () => {
  it('navigates original subschema with escaped tokens (property name contains "/")', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      unevaluatedProperties: false,
      additionalProperties: false,
      required: ['kind'],
      properties: {
        kind: { enum: ['A', 'B'] },
      },
      patternProperties: {
        '^a/b$': { const: 1 },
      },
      anyOf: [
        {
          properties: { kind: { const: 'A' }, 'a/b': { const: 1 } },
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
        patternWitness: {
          alphabet: 'ab/',
          maxLength: 3,
          maxCandidates: 256,
        },
      },
    });

    expect(out.items).toHaveLength(1);
    const obj = out.items[0] as Record<string, unknown>;
    expect(obj.kind).toBe('A');
    // Presence of 'a/b' demonstrates both RegExp match and E-Trace evaluation
    // which requires correct JSON Pointer unescaping of 'a~1b' back to 'a/b'.
    expect(Object.prototype.hasOwnProperty.call(obj, 'a/b')).toBe(true);
  });

  it('navigates original subschema with escaped tokens (property name contains "~")', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      unevaluatedProperties: false,
      additionalProperties: false,
      required: ['kind'],
      properties: {
        kind: { enum: ['A'] },
      },
      patternProperties: {
        '^a~b$': { const: 1 },
      },
      anyOf: [
        {
          properties: { kind: { const: 'A' }, 'a~b': { const: 1 } },
          required: ['kind'],
        },
      ],
      minProperties: 2,
    } as const;

    const eff = composeSchema(schema);
    const out = generateFromCompose(eff, {
      sourceSchema: schema,
      planOptions: {
        patternWitness: { alphabet: 'ab~', maxLength: 3, maxCandidates: 256 },
      },
    });

    const obj = out.items[0] as Record<string, unknown>;
    expect(obj.kind).toBe('A');
    expect(Object.prototype.hasOwnProperty.call(obj, 'a~b')).toBe(true);
  });
});
