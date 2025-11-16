import { describe, expect, it } from 'vitest';

import { runPipelineStages } from './test-helpers.js';
import { DIAGNOSTIC_CODES } from '../../src/diag/codes.js';

describe('§9 oneOf exclusivity diagnostics', () => {
  const schema: Record<string, unknown> = {
    type: 'object',
    unevaluatedProperties: false,
    oneOf: [
      {
        type: 'object',
        properties: {
          variant: { const: 'even' },
          value: { type: 'integer', multipleOf: 2 },
        },
        required: ['variant', 'value'],
        additionalProperties: false,
      },
      {
        type: 'object',
        properties: {
          variant: { const: 'odd' },
          value: { type: 'integer', not: { multipleOf: 2 } },
        },
        required: ['variant', 'value'],
        additionalProperties: false,
      },
    ],
  };

  it('skips exclusivity diagnostics when discriminants already isolate branches', () => {
    const { generate } = runPipelineStages(schema, {
      generate: { seed: 2024, count: 1 },
    });
    const diag = generate.diagnostics.find(
      (entry) => entry.code === DIAGNOSTIC_CODES.EXCLUSIVITY_TWEAK_STRING
    );
    expect(diag).toBeUndefined();
  });
});
