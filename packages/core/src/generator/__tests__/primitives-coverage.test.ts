import { describe, expect, it } from 'vitest';

import { normalize } from '../../transform/schema-normalizer';
import { compose } from '../../transform/composition-engine';
import { generateFromCompose } from '../foundry-generator';

function gen(schema: unknown): unknown {
  const eff = compose(normalize(schema));
  const out = generateFromCompose(eff);
  return out.items[0];
}

describe('Primitive generators (additional coverage)', () => {
  it('boolean: honors const=false and default=false', () => {
    const v1 = gen({ type: 'boolean', const: false });
    expect(v1).toBe(false);
    const v2 = gen({ type: 'boolean', default: false });
    expect(v2).toBe(false);
  });

  it('integer: applies maximum boundary clamp below baseline', () => {
    const v = gen({ type: 'integer', maximum: -1 });
    expect(v).toBe(-1);
  });
});
