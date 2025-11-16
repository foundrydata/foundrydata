import { describe, it, expect } from 'vitest';
import { repairItemsAjvDriven } from '../../repair/repair-engine';

function eff(): any {
  return {
    canonical: { revPtrMap: new Map<string, string[]>([['#', ['#']]]) },
    coverageIndex: new Map(),
  };
}

describe('Repair Engine — minItems growth respects prefixItems', () => {
  it('fills using prefixItems schema first, then items schema', () => {
    const schema = {
      type: 'array',
      prefixItems: [{ const: 1 }, { const: 2 }],
      items: { type: 'number' },
      minItems: 3,
    } as const;
    const out = repairItemsAjvDriven(
      [[1]],
      { schema, effective: eff() },
      { attempts: 3 }
    );
    const arr = out.items[0] as number[];
    expect(arr.length).toBe(3);
    expect(arr[0]).toBe(1);
    expect(arr[1]).toBe(2); // from prefixItems[1]
    expect(typeof arr[2]).toBe('number'); // from items schema
  });
});
