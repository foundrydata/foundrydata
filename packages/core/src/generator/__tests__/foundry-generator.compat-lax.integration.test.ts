import { describe, it, expect } from 'vitest';
import { FoundryGenerator } from '../foundry-generator';
import { isErr } from '../../types/result';

describe('FoundryGenerator – compat=lax vs strict (unsupported features)', () => {
  it('strict fails fast on unsupported features (contains), lax proceeds and validates 100%', () => {
    // Array schema with "contains" (unsupported for planning) but easy to satisfy given items are strings
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      contains: { type: 'string', minLength: 1 },
    } as const;

    const gen = new FoundryGenerator();

    // strict → should fail during Parse stage
    const strictRun = gen.run(schema as object, {
      count: 10,
      seed: 424242,
      locale: 'en',
      compat: 'strict',
    });
    expect(isErr(strictRun)).toBe(true);

    // lax → should generate and validate 100%
    const laxRun = gen.run(schema as object, {
      count: 10,
      seed: 424242,
      locale: 'en',
      compat: 'lax',
    });
    expect(laxRun.isOk()).toBe(true);
    if (!laxRun.isOk()) return;
    expect(laxRun.value.report.compliant).toBe(true);

    // Deterministic outputs for same seed
    const laxRun2 = gen.run(schema as object, {
      count: 10,
      seed: 424242,
      locale: 'en',
      compat: 'lax',
    });
    expect(laxRun2.isOk()).toBe(true);
    if (laxRun2.isOk()) {
      expect(laxRun2.value.items).toEqual(laxRun.value.items);
    }
  });
});
