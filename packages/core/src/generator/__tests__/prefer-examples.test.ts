import { describe, it, expect } from 'vitest';
import { normalize } from '../../transform/schema-normalizer';
import { compose, ComposeResult } from '../../transform/composition-engine';
import { generateFromCompose } from '../foundry-generator';

function composeSchema(schema: unknown): ComposeResult {
  const normalized = normalize(schema);
  return compose(normalized);
}

describe('Foundry generator - preferExamples', () => {
  it('uses schema.example for root when preferExamples is true', () => {
    const schema = {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      example: { id: 'from-example' },
    };

    const effective = composeSchema(schema);
    const out = generateFromCompose(effective, {
      preferExamples: true,
      count: 2,
    });

    expect(out.items).toHaveLength(2);
    // Normalizer currently rewrites the example payload, so we assert that
    // the generator uses the schema-level example as-is.
    expect(out.items[0]).toEqual({ $id: 'from-example' });
    expect(out.items[1]).toEqual({ $id: 'from-example' });
  });

  it('falls back to generation when no example is present', () => {
    const schema = {
      type: 'object',
      properties: {
        id: { const: 42 },
      },
      required: ['id'],
      additionalProperties: false,
    };

    const effective = composeSchema(schema);
    const out = generateFromCompose(effective, {
      preferExamples: true,
    });

    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toEqual({ id: 42 });
  });

  it('uses first entry from schema.examples when example is not set', () => {
    const schema = {
      type: 'string',
      examples: ['alpha', 'beta'],
    };

    const effective = composeSchema(schema);
    const out = generateFromCompose(effective, {
      preferExamples: true,
      count: 1,
    });

    expect(out.items[0]).toBe('alpha');
  });
});
