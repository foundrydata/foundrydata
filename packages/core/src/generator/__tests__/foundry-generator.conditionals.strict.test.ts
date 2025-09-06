import { describe, it, expect } from 'vitest';
import { FoundryGenerator } from '../foundry-generator';
import { createAjv } from '../../../../../test/helpers/ajv-factory';

describe('FoundryGenerator - conditionals (strict)', () => {
  it('generates objects satisfying top-level if/then/else requirements', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['A', 'B'] },
        foo: { type: 'string', minLength: 1 },
        bar: { type: 'number' },
      },
      required: ['kind'],
      if: { properties: { kind: { const: 'A' } }, required: ['kind'] },
      then: {
        required: ['foo'],
        properties: { foo: { type: 'string', minLength: 1 } },
      },
      else: { required: ['bar'], properties: { bar: { type: 'number' } } },
      additionalProperties: true,
    } as const;

    const gen = new FoundryGenerator();
    const r = gen.run(schema as object, {
      count: 25,
      seed: 424242,
      locale: 'en',
      compat: 'strict',
      repairAttempts: 2,
    });
    expect(r.isOk()).toBe(true);
    if (!r.isOk()) return;

    const ajv = createAjv('draft-07');
    const validate = ajv.compile(schema as object);
    for (const item of r.value.items) {
      const ok = validate(item);
      if (!ok) {
        console.error(
          'Conditional validation errors:',
          validate.errors,
          'item:',
          item
        );
      }
      expect(ok).toBe(true);
    }
  });
});
