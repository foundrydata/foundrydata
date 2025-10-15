import { describe, expect, it } from 'vitest';

import { normalize } from '../../transform/schema-normalizer';
import { compose } from '../../transform/composition-engine';
import { generateFromCompose } from '../foundry-generator';
import { DIAGNOSTIC_CODES } from '../../diag/codes';

function composeSchema(schema: unknown): ReturnType<typeof compose> {
  return compose(normalize(schema));
}

describe('Generator exclusivityRand logging', () => {
  it('records exclusivityRand for oneOf exclusivity during Generate', () => {
    const schema = {
      oneOf: [
        { type: 'string', const: 'x' },
        { type: 'string', const: 'y' },
      ],
    };

    const eff = composeSchema(schema);
    const out = generateFromCompose(eff);

    const diag = out.diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.EXCLUSIVITY_TWEAK_STRING
    );
    expect(diag).toBeDefined();
    expect(typeof diag?.scoreDetails?.exclusivityRand).toBe('number');
    const minimal = { code: diag!.code, canonPath: diag!.canonPath };
    expect(minimal).toMatchInlineSnapshot(`
      {
        "canonPath": "",
        "code": "EXCLUSIVITY_TWEAK_STRING",
      }
    `);
    const r = diag!.scoreDetails?.exclusivityRand as number;
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(1);
  });
});
