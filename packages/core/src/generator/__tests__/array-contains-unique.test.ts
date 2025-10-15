import { describe, it, expect } from 'vitest';

import { normalize } from '../../transform/schema-normalizer';
import { compose } from '../../transform/composition-engine';
import { generateFromCompose } from '../foundry-generator';

describe('Array generation — contains + uniqueItems minimal filler', () => {
  it('satisfies contains, enforces uniqueItems and fills with unique fallback', () => {
    const schema = {
      type: 'array',
      minItems: 2,
      uniqueItems: true,
      // Force duplicates from items
      items: { const: 1 },
      // And also explicitly require one occurrence of 1
      contains: { const: 1 },
      minContains: 1,
    } as const;

    const eff = compose(normalize(schema));
    const out = generateFromCompose(eff, { seed: 123 });
    const arr = out.items[0] as unknown[];

    expect(Array.isArray(arr)).toBe(true);
    // minimal length honored after uniqueness
    expect(arr.length).toBe(2);
    // array should contain a `1` and a unique filler distinct from 1
    expect(arr.some((v) => v === 1)).toBe(true);
    expect(arr.some((v) => typeof v === 'object')).toBe(true);
  });
});
