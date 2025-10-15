import { describe, it, expect } from 'vitest';

import { normalize } from '../../transform/schema-normalizer';
import { compose } from '../../transform/composition-engine';
import { generateFromCompose } from '../foundry-generator';

describe('allOf merging — numeric constraints and multipleOf LCM', () => {
  it('merges min/max/exclusive and computes LCM for multipleOf', () => {
    const schema = {
      allOf: [
        { type: 'integer', minimum: -5, multipleOf: 6 },
        { type: 'integer', maximum: 10, multipleOf: 4 },
      ],
    } as const;

    const eff = compose(normalize(schema));
    const out = generateFromCompose(eff);
    const v = out.items[0] as number;

    expect(Number.isInteger(v)).toBe(true);
    // The merged multipleOf should be LCM(6,4)=12; 0 is valid and within bounds
    expect(v % 12).toBe(0);
    expect(v).toBeGreaterThanOrEqual(-5);
    expect(v).toBeLessThanOrEqual(10);
  });
});
