import { describe, it, expect } from 'vitest';
import '../../../../../../test/matchers/index';
import { ArrayGenerator } from '../array-generator';
import { FormatRegistry } from '../../../registry/format-registry';
import { createGeneratorContext } from '../../data-generator';

describe('ArrayGenerator – Draft-07 tuple additionalItems(schema)', () => {
  it('generates suffix items using additionalItems schema', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'array',
      items: [{ type: 'string' }, { type: 'integer' }],
      additionalItems: { type: 'boolean' },
      minItems: 3,
      maxItems: 4,
    } as const;

    const gen = new ArrayGenerator();
    const ctx = createGeneratorContext(schema as any, new FormatRegistry(), {
      seed: 424242,
    });
    const res = gen.generate(schema as any, ctx);
    expect(res.isOk()).toBe(true);
    if (!res.isOk()) return;
    const arr = res.value as unknown[];
    expect(arr).toMatchJsonSchema(schema, 'draft-07');
    expect(arr.length).toBeGreaterThanOrEqual(3);
    // Check tuple head types
    expect(typeof arr[0]).toBe('string');
    expect(Number.isInteger(arr[1] as number)).toBe(true);
    // Suffix are booleans
    for (let i = 2; i < arr.length; i++) {
      expect(typeof arr[i]).toBe('boolean');
    }
  });
});
