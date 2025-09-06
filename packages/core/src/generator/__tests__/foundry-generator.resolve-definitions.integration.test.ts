import { describe, it, expect } from 'vitest';
import { FoundryGenerator } from '../foundry-generator';

describe('FoundryGenerator Resolve stage – draft-07 definitions → $defs normalization', () => {
  it('expands #/definitions refs for planning/generation and validates 100%', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      definitions: {
        Name: { type: 'string', minLength: 3 },
      },
      properties: {
        name: { $ref: '#/definitions/Name' },
      },
      required: ['name'],
    } as const;

    const gen = new FoundryGenerator();
    const r1 = gen.run(schema as object, {
      count: 10,
      seed: 424242,
      locale: 'en',
    });
    expect(r1.isOk()).toBe(true);
    if (!r1.isOk()) return;
    expect(r1.value.report.compliant).toBe(true);

    const r2 = gen.run(schema as object, {
      count: 10,
      seed: 424242,
      locale: 'en',
    });
    expect(r2.isOk()).toBe(true);
    if (r2.isOk()) {
      expect(r2.value.items).toEqual(r1.value.items);
    }
  });
});
