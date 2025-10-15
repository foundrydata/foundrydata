import { describe, it, expect } from 'vitest';

import { normalize } from '../../transform/schema-normalizer';
import { compose } from '../../transform/composition-engine';
import { generateFromCompose } from '../foundry-generator';

describe('Object generation — minProperties via anchored patternProperties', () => {
  it('uses anchored patternProperties to satisfy minProperties under AP:false', () => {
    const schema = {
      type: 'object',
      minProperties: 1,
      // AP:false with evaluated gating
      additionalProperties: false,
      // Anchored safe pattern; should enumerate a single-letter name like "a"
      patternProperties: {
        '^[a]$': { type: 'integer', const: 2 },
      },
    } as const;

    const eff = compose(normalize(schema));
    const out = generateFromCompose(eff, { seed: 42 });
    const obj = out.items[0] as Record<string, unknown>;

    expect(obj && typeof obj === 'object').toBe(true);
    const keys = Object.keys(obj);
    expect(keys.length).toBeGreaterThanOrEqual(1);
    // Generated key should match the pattern, and value should be const 2
    const k = keys[0]!; // non-empty by assertion above
    expect(/^a$/.test(k)).toBe(true);
    expect(obj[k as keyof typeof obj]).toBe(2);
    // Pattern witness trials should be recorded deterministically
    expect(out.metrics.patternWitnessTried).toBeGreaterThan(0);
  });
});
