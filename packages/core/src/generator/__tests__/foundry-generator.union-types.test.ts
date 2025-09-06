import { describe, it, expect } from 'vitest';
import '../../../../../test/matchers/index';
import { FoundryGenerator } from '../foundry-generator';
import { createAjv } from '../../../../../test/helpers/ajv-factory';

describe('FoundryGenerator - union types (type: ["string","null"])', () => {
  it('generates values that validate for string|null with minLength applying to strings', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: ['string', 'null'],
      minLength: 2,
    } as const;

    const gen = new FoundryGenerator();
    // Use compat=lax to proceed despite parser not supporting union types yet
    const r = gen.run(schema as object, {
      count: 20,
      seed: 424242,
      locale: 'en',
      compat: 'lax',
    });
    expect(r.isOk()).toBe(true);
    if (!r.isOk()) return;

    const ajv = createAjv('draft-07');
    const validate = ajv.compile(schema as object);
    for (const item of r.value.items) {
      const valid = validate(item);
      if (!valid) {
        // Helpful diagnostic on failure
        console.error(
          'Union validation errors:',
          validate.errors,
          'value:',
          item
        );
      }
      expect(valid).toBe(true);
    }
  });
});
