import { describe, it, expect } from 'vitest';
import { repairItemsAjvDriven } from '../../repair/repair-engine';

function eff(): any {
  return {
    canonical: { revPtrMap: new Map<string, string[]>([['#', ['#']]]) },
  };
}

describe('Repair Engine — type mapping for object', () => {
  it('coerces non-object to {} for type:object violations', () => {
    const schema = { type: 'object' } as const;
    const out = repairItemsAjvDriven(
      ['not-an-object'],
      { schema, effective: eff() },
      { attempts: 1 }
    );
    expect(out.items[0]).toEqual({});
  });
});
