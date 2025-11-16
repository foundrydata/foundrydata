import { describe, it, expect } from 'vitest';
import {
  compose,
  generateFromCompose,
  normalize,
  repairItemsAjvDriven,
  type PlanOptions,
} from '../index.js';

describe('public API surface', () => {
  it('exports usable stage entry points', () => {
    const schema = { type: 'string', minLength: 3 } as const;
    const normalized = normalize(schema);
    expect(normalized.ptrMap instanceof Map).toBe(true);

    const composed = compose(normalized);
    expect(composed.coverageIndex instanceof Map).toBe(true);

    const generated = generateFromCompose(composed, { count: 1, seed: 13 });
    expect(Array.isArray(generated.items)).toBe(true);
    expect(typeof generated.items[0]).toBe('string');

    const repairOutcome = repairItemsAjvDriven(
      ['a'],
      { schema, effective: composed },
      { attempts: 1 }
    );
    expect(Array.isArray(repairOutcome.items)).toBe(true);
    expect(typeof repairOutcome.items[0]).toBe('string');
    expect(repairOutcome.items[0]).toHaveLength(3);
    expect(repairOutcome.actions.length).toBeGreaterThanOrEqual(1);
  });

  it('exposes PlanOptions type additions', () => {
    const opts: PlanOptions = {
      patternPolicy: { unsafeUnderApFalse: 'warn' },
      complexity: { maxOneOfBranches: 200 },
    };
    expect(opts.patternPolicy?.unsafeUnderApFalse).toBe('warn');
  });
});
