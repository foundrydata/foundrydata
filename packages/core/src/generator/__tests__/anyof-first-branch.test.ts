import { describe, it, expect } from 'vitest';

import { normalize } from '../../transform/schema-normalizer';
import { compose } from '../../transform/composition-engine';
import { generateFromCompose } from '../foundry-generator';

describe('anyOf generation — aligns with composition branch selection', () => {
  it('returns value from the branch chosen during composition', () => {
    const schema = { anyOf: [{ const: 11 }, { const: 22 }] } as const;
    const eff = compose(normalize(schema));
    const chosen = eff.diag?.nodes?.['/anyOf']?.chosenBranch?.index ?? 0;
    const expected = schema.anyOf[chosen]?.const;
    const out = generateFromCompose(eff);
    expect(out.items[0]).toBe(expected);
  });
});
