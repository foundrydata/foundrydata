import { describe, expect, it } from 'vitest';

import { executePipeline } from '../orchestrator';
import { DIAGNOSTIC_CODES } from '../../diag/codes';

describe('Pipeline exclusivity diagnostics (end-to-end)', () => {
  it('emits exclusivityRand diagnostic when resolving oneOf in Generate', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      oneOf: [
        { type: 'string', const: 'x' },
        { type: 'string', const: 'y' },
      ],
    } as const;

    const result = await executePipeline(schema, {
      generate: { count: 1 },
      validate: { validateFormats: false },
    });

    expect(result.status).toBe('completed');
    // Generator artifacts present
    const gen = result.artifacts.generated;
    expect(gen).toBeDefined();
    const diag = gen?.diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.EXCLUSIVITY_TWEAK_STRING
    );
    expect(diag).toBeDefined();
    expect(typeof diag?.scoreDetails?.exclusivityRand).toBe('number');

    // Snapshot minimal stable fields; exclusivityRand presence checked separately
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
