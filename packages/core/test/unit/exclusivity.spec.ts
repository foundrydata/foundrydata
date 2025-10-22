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

  function exclusivityRandForSeed(seed: number): number {
    const { generate } = runPipelineStages(schema, {
      generate: { seed, count: 1 },
    });
    const diag = generate.diagnostics.find(
      (entry) => entry.code === DIAGNOSTIC_CODES.EXCLUSIVITY_TWEAK_STRING
    );
    expect(diag).toBeDefined();
    const rand = diag?.scoreDetails?.exclusivityRand;
    expect(typeof rand).toBe('number');
    expect(rand).toBeGreaterThanOrEqual(0);
    expect(rand).toBeLessThan(1);
    return rand as number;
  }

  it('produces a deterministic exclusivityRand per seed and canonPath', () => {
    const first = exclusivityRandForSeed(1234);
    const second = exclusivityRandForSeed(1234);
    expect(second).toBeCloseTo(first, 12);
    const different = exclusivityRandForSeed(9876);
    expect(different).not.toBe(first);
  });
});
