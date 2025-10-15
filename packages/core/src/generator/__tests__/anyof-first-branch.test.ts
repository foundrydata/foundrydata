import { describe, it, expect } from 'vitest';

import { normalize } from '../../transform/schema-normalizer';
import { compose } from '../../transform/composition-engine';
import { generateFromCompose } from '../foundry-generator';

describe('anyOf generation — chooses first branch deterministically', () => {
  it('returns value from first branch of anyOf', () => {
    const schema = { anyOf: [{ const: 11 }, { const: 22 }] } as const;
    const eff = compose(normalize(schema));
    const out = generateFromCompose(eff);
    expect(out.items[0]).toBe(11);
  });
});
