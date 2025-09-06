import { describe, it, expect } from 'vitest';
import { FoundryGenerator } from '../foundry-generator';

describe('FoundryGenerator Resolve stage ($ref/$defs)', () => {
  it('generates compliant data for schema using $defs + $ref', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      $defs: {
        Name: { type: 'string', minLength: 2 },
        Age: { type: 'integer', minimum: 0, maximum: 130 },
      },
      properties: {
        name: { $ref: '#/$defs/Name' },
        age: { $ref: '#/$defs/Age' },
      },
      required: ['name', 'age'],
    } as const;

    const gen = new FoundryGenerator();
    const r = gen.run(schema as object, { count: 25, seed: 123 });
    expect(r.isOk()).toBe(true);
    if (!r.isOk()) return;
    expect(r.value.report.compliant).toBe(true);
    // Determinism check
    const r2 = gen.run(schema as object, { count: 25, seed: 123 });
    expect(r2.isOk()).toBe(true);
    if (r2.isOk()) {
      expect(r2.value.items).toEqual(r.value.items);
    }
  });
});
