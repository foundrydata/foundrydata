import { describe, expect, it } from 'vitest';

import { normalize } from '../../transform/schema-normalizer';
import { compose } from '../../transform/composition-engine';
import { generateFromCompose } from '../foundry-generator';
import { DIAGNOSTIC_CODES } from '../../diag/codes';

function composeSchema(schema: unknown): ReturnType<typeof compose> {
  const normalized = normalize(schema);
  return compose(normalized);
}

describe('Pattern witness caps — candidateBudget', () => {
  it('emits COMPLEXITY_CAP_PATTERNS with reason=candidateBudget when maxCandidates is exceeded', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: {
        id: { const: 1 },
      },
      patternProperties: {
        '^a$': { const: 2 },
      },
      minProperties: 2,
    } as const;

    const eff = composeSchema(schema);
    const out = generateFromCompose(eff, {
      planOptions: {
        patternWitness: {
          alphabet: 'a',
          maxLength: 1,
          // This forces the enumerator to cap after trying '', then attempting 'a'
          // tried will be recorded as 1 in the diagnostic payload
          maxCandidates: 1,
        },
      },
    });

    const diag = out.diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.COMPLEXITY_CAP_PATTERNS
    );
    expect(diag).toBeDefined();
    expect(diag?.details).toMatchObject({ reason: 'candidateBudget' });
    expect(diag?.budget).toMatchObject({
      tried: 1,
      limit: 1,
      skipped: true,
      reason: 'complexityCap',
    });
    // scoreDetails.tiebreakRand must always be present
    expect(typeof diag?.scoreDetails?.tiebreakRand).toBe('number');

    // Metric should have been incremented at least once
    expect(out.metrics.patternWitnessTried ?? 0).toBeGreaterThan(0);
  });

  it('emits COMPLEXITY_CAP_PATTERNS with reason=candidateBudget when regex is complexity-capped', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: {
        id: { const: 1 },
      },
      // Quantified group pattern triggers complexityCapped in analyzePatternForWitness
      patternProperties: {
        '^(ab)+$': { const: 2 },
      },
      minProperties: 2,
    } as const;

    const eff = composeSchema(schema);
    const out = generateFromCompose(eff, {
      planOptions: {
        patternWitness: {
          alphabet: 'ab',
          maxLength: 4,
          maxCandidates: 8,
        },
      },
    });

    const diag = out.diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.COMPLEXITY_CAP_PATTERNS
    );
    expect(diag).toBeDefined();
    expect(diag?.details).toMatchObject({ reason: 'candidateBudget' });
    expect(diag?.budget).toMatchObject({
      skipped: true,
      reason: 'complexityCap',
    });
  });
});
