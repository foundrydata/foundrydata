import { describe, it, expect } from 'vitest';
import '../../../../../test/matchers/index';
import { FoundryGenerator } from '../foundry-generator';

describe('FoundryGenerator - allOf object merge (properties + required)', () => {
  it('merges properties and unions required (simple case)', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      allOf: [
        {
          type: 'object',
          properties: {
            id: { type: 'string', minLength: 1 },
          },
          required: ['id'],
        },
        {
          type: 'object',
          properties: {
            age: { type: 'integer', minimum: 0 },
          },
          required: ['age'],
        },
      ],
    } as const;

    const gen = new FoundryGenerator();
    const r = gen.run(schema as object, {
      count: 10,
      seed: 424242,
      locale: 'en',
    });
    expect(r.isOk()).toBe(true);
    if (!r.isOk()) return;

    // Validate all and check merged requirements
    for (const item of r.value.items) {
      expect(item).toMatchJsonSchema(schema, '2020-12');
      const obj = item as Record<string, unknown>;
      expect(typeof obj.id).toBe('string');
      expect(Number.isInteger(obj.age as number)).toBe(true);
    }
  });

  it('merges disjoint properties and unions multi-required', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      allOf: [
        {
          type: 'object',
          properties: {
            id: { type: 'string', minLength: 1 },
            name: { type: 'string', minLength: 1 },
          },
          required: ['id', 'name'],
        },
        {
          type: 'object',
          properties: {
            active: { type: 'boolean' },
          },
          required: ['active'],
        },
      ],
    } as const;

    const gen = new FoundryGenerator();
    const r = gen.run(schema as object, {
      count: 5,
      seed: 13579,
      locale: 'en',
    });
    expect(r.isOk()).toBe(true);
    if (!r.isOk()) return;

    for (const item of r.value.items) {
      expect(item).toMatchJsonSchema(schema, '2020-12');
      const obj = item as Record<string, unknown>;
      expect(typeof obj.id).toBe('string');
      expect(typeof obj.name).toBe('string');
      expect(typeof obj.active).toBe('boolean');
    }
  });
});
