import { describe, it, expect } from 'vitest';

import { normalize } from '../../transform/schema-normalizer';
import { compose } from '../../transform/composition-engine';
import { generateFromCompose } from '../foundry-generator';

describe('Array generation — contains + uniqueItems minimal filler', () => {
  it('satisfies contains and leaves unsatisfiable unique constraints for downstream repair', () => {
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
    // contains requirement respected
    expect(arr.filter((v) => v === 1).length).toBeGreaterThanOrEqual(1);
    // domain is unsatisfiable under uniqueItems; generator stops after the feasible item
    expect(arr.length).toBe(1);
    expect(arr.every((v) => typeof v !== 'object')).toBe(true);
  });
});
