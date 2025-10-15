import { describe, expect, it } from 'vitest';

import { normalize } from '../../transform/schema-normalizer';
import { compose } from '../../transform/composition-engine';
import { generateFromCompose } from '../foundry-generator';

describe('oneOf branch choice honors Composition diagnostics', () => {
  it('uses chosenBranch index when provided by composition engine', () => {
    const schema = {
      oneOf: [
        { type: 'string', const: 'x' },
        { type: 'string', const: 'y' },
      ],
    } as const;

    const eff = compose(normalize(schema));
    // Inject diagnostics: pick branch index 1
    (eff as any).diag = (eff as any).diag ?? {};
    (eff as any).diag.nodes = { '': { chosenBranch: { index: 1, score: 1 } } };

    const out = generateFromCompose(eff);
    expect(out.items[0]).toBe('y');
  });
});
