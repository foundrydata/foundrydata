import { describe, it, expect } from 'vitest';
import '../../../../../../test/matchers/index';
import { ObjectGenerator } from '../object-generator';
import { FormatRegistry } from '../../../registry/format-registry';
import { createGeneratorContext } from '../../data-generator';

describe('ObjectGenerator – Draft-07 dependencies (schema)', () => {
  it('applies schema dependency to add required and properties', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        cc: { type: 'number' },
        // Declare billing at root so additionalProperties:false is satisfied when dependency adds it
        billing: {
          type: 'object',
          properties: { zip: { type: 'string', minLength: 5 } },
          required: ['zip'],
          additionalProperties: false,
        },
      },
      required: ['cc'],
      dependencies: {
        cc: {
          type: 'object',
          properties: {
            billing: {
              type: 'object',
              properties: { zip: { type: 'string', minLength: 5 } },
              required: ['zip'],
              additionalProperties: false,
            },
          },
          required: ['billing'],
        },
      },
      additionalProperties: false,
    } as const;

    const gen = new ObjectGenerator();
    const ctx = createGeneratorContext(schema as any, new FormatRegistry(), {
      seed: 424242,
    });
    const res = gen.generate(schema as any, ctx);
    expect(res.isOk()).toBe(true);
    if (!res.isOk()) return;
    const obj = res.value as Record<string, unknown>;
    expect(obj).toMatchJsonSchema(schema, 'draft-07');
  });
});
