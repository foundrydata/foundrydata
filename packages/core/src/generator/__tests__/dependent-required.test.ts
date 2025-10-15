import { describe, it, expect } from 'vitest';

import { normalize } from '../../transform/schema-normalizer';
import { compose } from '../../transform/composition-engine';
import { generateFromCompose } from '../foundry-generator';

describe('Object generation — dependentRequired', () => {
  it('adds dependent properties when trigger is present', () => {
    const schema = {
      type: 'object',
      required: ['a'],
      properties: {
        a: { const: 1 },
        b: { const: 2 },
      },
      dependentRequired: {
        a: ['b'],
      },
    } as const;

    const eff = compose(normalize(schema));
    const out = generateFromCompose(eff);
    const obj = out.items[0] as Record<string, unknown>;
    expect(obj.a).toBe(1);
    expect(obj.b).toBe(2);
  });
});
