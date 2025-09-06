import { describe, it, expect } from 'vitest';
import '../../../../../../test/matchers/index';
import { ObjectGenerator } from '../object-generator';
import { FormatRegistry } from '../../../registry/format-registry';
import { createGeneratorContext } from '../../data-generator';

describe('ObjectGenerator - patternProperties & propertyNames (positive)', () => {
  it('generates an object compliant with propertyNames and patternProperties when properties are defined', () => {
    const generator = new ObjectGenerator();
    const formatRegistry = new FormatRegistry();

    const schema = {
      type: 'object',
      propertyNames: { pattern: '^[a-z]{1,5}$' },
      patternProperties: {
        // Exclude explicit property key 'name' from pattern to satisfy AJV strict mode
        '^(?!name$)[a-z]+$': { type: 'integer', minimum: 0 },
      },
      properties: {
        name: { type: 'integer', minimum: 0 },
      },
      required: ['name'],
      additionalProperties: false,
    } as const;

    const ctx = createGeneratorContext(schema as any, formatRegistry, {
      seed: 424242,
    });
    const res = generator.generate(schema as any, ctx);
    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      const value = res.value;
      expect(value).toMatchJsonSchema(schema, 'draft-07');
    }
  });
});
