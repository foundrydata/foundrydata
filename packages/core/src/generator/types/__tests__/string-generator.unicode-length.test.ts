import { describe, it, expect } from 'vitest';
import '../../../../../../test/matchers/index';
import { StringGenerator } from '../string-generator';
import { FormatRegistry } from '../../../registry/format-registry';
import { createGeneratorContext } from '../../data-generator';

function codePointLength(s: string): number {
  return [...s].length;
}

describe('StringGenerator - Unicode length semantics (code points)', () => {
  it('respects minLength/maxLength measured in Unicode code points', () => {
    const generator = new StringGenerator();
    const formatRegistry = new FormatRegistry();

    const schema = {
      type: 'string',
      minLength: 1,
      maxLength: 2,
    } as const;

    const ctx = createGeneratorContext(schema as any, formatRegistry, {
      seed: 1337,
    });
    const res = generator.generate(schema as any, ctx);
    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      const v = res.value as string;
      const cp = codePointLength(v);
      expect(cp).toBeGreaterThanOrEqual(1);
      expect(cp).toBeLessThanOrEqual(2);
      expect(v).toMatchJsonSchema(schema, 'draft-07');
    }
  });
});
