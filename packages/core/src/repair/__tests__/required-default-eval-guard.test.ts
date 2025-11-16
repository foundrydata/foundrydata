import { describe, it, expect } from 'vitest';
import { repairItemsAjvDriven } from '../../repair/repair-engine';

function eff(): any {
  return {
    canonical: { revPtrMap: new Map<string, string[]>([['#', ['#']]]) },
    coverageIndex: new Map(),
  };
}

describe('Repair Engine — required default with evaluation guard', () => {
  it('adds missing required property using default (evaluated via properties)', () => {
    const schema = {
      type: 'object',
      unevaluatedProperties: false,
      properties: { a: { type: 'string', default: 'x' } },
      required: ['a'],
    } as const;
    const items = [{}];
    const out = repairItemsAjvDriven(
      items,
      { schema, effective: eff() },
      { attempts: 1 }
    );
    expect(out.items[0]).toHaveProperty('a', 'x');
  });
});
