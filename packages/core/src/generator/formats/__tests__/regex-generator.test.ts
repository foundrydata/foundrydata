import { describe, it, expect } from 'vitest';
import { RegexGenerator } from '../regex-generator';
import { createAjv } from '../../../../../../test/helpers/ajv-factory';
import { FoundryGenerator } from '../../foundry-generator';

describe('RegexGenerator', () => {
  it('validates generated patterns compile as RegExp', () => {
    const gen = new RegexGenerator();
    const r = gen.generate();
    expect(r.isOk()).toBe(true);
    if (!r.isOk()) return;
    const pattern = r.value;
    expect(gen.validate(pattern)).toBe(true);
    // Should compile
    new RegExp(pattern);
  });

  it('integrates with FoundryGenerator for format: "regex"', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'string',
      format: 'regex',
    } as const;
    const foundry = new FoundryGenerator();
    const r = foundry.run(schema as object, {
      count: 5,
      seed: 123,
      compat: 'strict',
      locale: 'en',
    });
    expect(r.isOk()).toBe(true);
    if (!r.isOk()) return;
    const ajv = createAjv('draft-07');
    const validate = ajv.compile(schema as object);
    for (const v of r.value.items) {
      expect(validate(v)).toBe(true);
    }
  });
});
