import { describe, it, expect } from 'vitest';
import '../../../../../../test/matchers/index';
import { ArrayGenerator } from '../array-generator';
import { FormatRegistry } from '../../../registry/format-registry';
import { createGeneratorContext } from '../../data-generator';

describe('ArrayGenerator - contains/minContains/maxContains', () => {
  it('generates arrays satisfying contains + minContains/maxContains (2020-12)', () => {
    const generator = new ArrayGenerator();
    const formatRegistry = new FormatRegistry();

    const schema = {
      type: 'array',
      items: { type: 'integer', minimum: 0, maximum: 5 },
      contains: { const: 3 },
      minContains: 1,
      maxContains: 2,
      minItems: 3,
      maxItems: 6,
    } as const;

    const ctx = createGeneratorContext(schema as any, formatRegistry, {
      seed: 424242,
    });
    const res = generator.generate(schema as any, ctx);
    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      const arr = res.value as unknown[];
      expect(arr).toMatchJsonSchema(schema, '2020-12');
    }
  });

  it('generates arrays satisfying contains (draft-07: implicit minContains=1)', () => {
    const generator = new ArrayGenerator();
    const formatRegistry = new FormatRegistry();

    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'array',
      items: { type: 'string' },
      contains: { const: 'X' },
      minItems: 1,
      maxItems: 5,
    } as const;

    const ctx = createGeneratorContext(schema as any, formatRegistry, {
      seed: 12345,
    });
    const res = generator.generate(schema as any, ctx);
    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      const arr = res.value as unknown[];
      expect(arr).toMatchJsonSchema(schema, 'draft-07');
    }
  });

  it('handles uniqueItems with contains constraints', () => {
    const generator = new ArrayGenerator();
    const formatRegistry = new FormatRegistry();

    const schema = {
      type: 'array',
      items: { type: 'integer', minimum: 0, maximum: 10 },
      uniqueItems: true,
      contains: { const: 3 },
      minContains: 1,
      maxContains: 1,
      minItems: 3,
      maxItems: 5,
    } as const;

    const ctx = createGeneratorContext(schema as any, formatRegistry, {
      seed: 987654,
    });
    const res = generator.generate(schema as any, ctx);
    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      const arr = res.value as unknown[];
      expect(arr).toMatchJsonSchema(schema, '2020-12');
    }
  });

  it('respects tuple prefixItems with contains targeting a compatible position', () => {
    const generator = new ArrayGenerator();
    const formatRegistry = new FormatRegistry();

    const schema: any = {
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: 'number', minimum: 0 }],
      items: false, // strictly 2 items
      contains: { type: 'number', minimum: 0 },
      minContains: 1,
      maxContains: 1,
      minItems: 2,
      maxItems: 2,
    };

    const ctx = createGeneratorContext(schema, formatRegistry, { seed: 24680 });
    const res = generator.generate(schema, ctx);
    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      const arr = res.value as unknown[];
      expect(arr).toMatchJsonSchema(schema, '2020-12');
    }
  });
});
