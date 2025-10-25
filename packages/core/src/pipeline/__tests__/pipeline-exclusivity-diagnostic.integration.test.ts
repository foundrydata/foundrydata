import { describe, expect, it } from 'vitest';

import { executePipeline } from '../orchestrator';
import { DIAGNOSTIC_CODES } from '../../diag/codes';

describe('Pipeline exclusivity diagnostics (end-to-end)', () => {
  it('emits exclusivity diagnostics only when a tweak is applied', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            kind: { const: 'alpha' },
            guard: { const: true },
            payload: { type: 'string', minLength: 1 },
          },
          required: ['kind', 'guard', 'payload'],
        },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            kind: { const: 'alpha' },
            guard: { const: true },
            payload: { type: 'string', minLength: 1, pattern: '^-+$' },
          },
          required: ['kind', 'payload'],
        },
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
    expect(diag?.details).toEqual({ char: '\u0000' });
    expect(diag?.scoreDetails?.exclusivityRand).toBeUndefined();
  });
});
