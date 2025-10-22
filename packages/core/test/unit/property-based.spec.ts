import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { DIAGNOSTIC_CODES } from '../../src/diag/codes.js';
import {
  runPipelineStages,
  createSourceAjvForSchema,
  compileOneOfBranchValidators,
  composeEffective,
} from './test-helpers.js';

describe('§20 property-based validation', () => {
  describe('oneOf exclusivity fuzzing', () => {
    const exclusivitySchema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      unevaluatedProperties: false,
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            variant: { const: 'even' },
            value: { type: 'integer', multipleOf: 2 },
          },
          required: ['variant', 'value'],
        },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            variant: { const: 'odd' },
            value: {
              type: 'integer',
              not: { multipleOf: 2 },
            },
          },
          required: ['variant', 'value'],
        },
      ],
    } as const;

    const ajv = createSourceAjvForSchema(exclusivitySchema);
    const branchValidators = compileOneOfBranchValidators(
      ajv,
      exclusivitySchema
    );

    it('validates exclusivity across seeds with deterministic diagnostics', () => {
      const property = fc.property(
        fc.integer({ min: 0, max: 10_000 }),
        (seed) => {
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
          expect(diag).toBeDefined();
          const rand = diag?.scoreDetails?.exclusivityRand;
          expect(typeof rand).toBe('number');
          expect((rand as number) >= 0 && (rand as number) < 1).toBe(true);
        }
      );

      fc.assert(property, { seed: 202_602, numRuns: 25 });
    });
  });

  describe('AP:false must-cover enforcement', () => {
    const mustCoverSchema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      propertyNames: { enum: ['anchor', 'guarded', 'aux'] },
      required: ['anchor'],
      dependentRequired: {
        anchor: ['guarded'],
      },
      properties: {
        anchor: { const: 'alpha' },
        guarded: { type: 'string', minLength: 1 },
        aux: { type: 'number', minimum: 0 },
      },
    } as const;

    const coverageEntry =
      composeEffective(mustCoverSchema).canonical.coverageIndex.get('') ??
      undefined;
    const enumeratedMustCover = new Set<string>(
      coverageEntry?.enumerate?.() ?? []
    );
    const ajv = createSourceAjvForSchema(mustCoverSchema);

    it('keeps generated keys inside the proven must-cover set', () => {
      const property = fc.property(
        fc.integer({ min: 0, max: 10_000 }),
        (seed) => {
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
        }
      );

      fc.assert(property, { seed: 202_603, numRuns: 25 });
    });
  });
});
