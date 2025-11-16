import { describe, it, expect } from 'vitest';
import { repairItemsAjvDriven } from '../../repair/repair-engine';
import { DIAGNOSTIC_CODES } from '../../diag/codes';

function makeEffective(): any {
  return {
    canonical: { revPtrMap: new Map<string, string[]>([['#', ['#']]]) },
    coverageIndex: new Map(),
    containsBag: new Map(),
  };
}

describe('Repair Engine — stagnation guard', () => {
  it('emits UNSAT_BUDGET_EXHAUSTED when attempts are exhausted and errors remain', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        a: { type: 'string', minLength: 3 },
      },
      required: ['a'],
    } as const;

    const effective = makeEffective();
    const out = repairItemsAjvDriven(
      // Missing required property and extra property that cannot be renamed safely
      [{ extra: 1 }],
      { schema, effective },
      { attempts: 1 }
    );

    const budgetDiag = out.diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.UNSAT_BUDGET_EXHAUSTED
    );
    expect(budgetDiag).toBeDefined();
    expect(budgetDiag?.details).toMatchObject({
      cycles: expect.any(Number),
      lastErrorCount: expect.any(Number),
    });
  });
});
