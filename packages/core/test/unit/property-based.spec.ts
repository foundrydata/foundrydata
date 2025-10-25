import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { DIAGNOSTIC_CODES } from '../../src/diag/codes.js';
import {
  oneOfExclusivityFixture,
  mustCoverFixture,
} from '../fixtures/property-based.js';
import { runPipelineStages } from './test-helpers.js';

describe('§20 property-based validation', () => {
  describe('oneOf exclusivity fuzzing', () => {
    const {
      schema: exclusivitySchema,
      ajv,
      branchValidators,
      seedArbitrary,
    } = oneOfExclusivityFixture;

    it('validates exclusivity across seeds with deterministic diagnostics', () => {
      const property = fc.property(seedArbitrary, (seed) => {
        const { generate } = runPipelineStages(exclusivitySchema, {
          generate: { seed, count: 1 },
        });
        const item = generate.items[0];

        expect(ajv.validate(exclusivitySchema, item)).toBe(true);

        const branchHits = branchValidators.reduce((hits, validator) => {
          return hits + (validator(item) ? 1 : 0);
        }, 0);
        expect(branchHits).toBe(1);

        const diag = generate.diagnostics.find(
          (entry) => entry.code === DIAGNOSTIC_CODES.EXCLUSIVITY_TWEAK_STRING
        );
        expect(diag).toBeUndefined();
      });

      fc.assert(property, { seed: 202_602, numRuns: 25 });
    });
  });

  describe('AP:false must-cover enforcement', () => {
    const {
      schema: mustCoverSchema,
      ajv,
      enumeratedMustCover,
      seedArbitrary,
    } = mustCoverFixture;

    it('keeps generated keys inside the proven must-cover set', () => {
      const property = fc.property(seedArbitrary, (seed) => {
        const { generate } = runPipelineStages(mustCoverSchema, {
          generate: { seed, count: 1 },
        });
        const item = generate.items[0] as Record<string, unknown>;

        expect(ajv.validate(mustCoverSchema, item)).toBe(true);
        const keys = Object.keys(item);
        for (const key of keys) {
          expect(enumeratedMustCover.has(key), `Unexpected key ${key}`).toBe(
            true
          );
        }
        expect(item).toHaveProperty('anchor', 'alpha');
        expect(item).toHaveProperty('guarded');
        expect(typeof item.guarded).toBe('string');
      });

      fc.assert(property, { seed: 202_603, numRuns: 25 });
    });
  });
});
