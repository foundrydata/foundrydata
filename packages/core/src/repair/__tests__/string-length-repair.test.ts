import { describe, it, expect } from 'vitest';
import { repairItemsAjvDriven } from '../../repair/repair-engine';

function eff(): any {
  return {
    canonical: { revPtrMap: new Map<string, string[]>([['#', ['#']]]) },
    coverageIndex: new Map(),
  };
}

describe('Repair Engine — string minLength/maxLength by code points', () => {
  it('pads to satisfy minLength counting surrogate pairs as 1', () => {
    const schema = { type: 'string', minLength: 2 } as const;
    const items = ['😀']; // 1 code point, 2 code units
    const out = repairItemsAjvDriven(
      items,
      { schema, effective: eff() },
      { attempts: 2 }
    );
    const s = out.items[0] as string;
    expect([...s]).toHaveLength(2); // code points length
  });

  it('truncates to satisfy maxLength by code points', () => {
    const schema = { type: 'string', maxLength: 2 } as const;
    const items = ['A😀B']; // 3 code points
    const out = repairItemsAjvDriven(
      items,
      { schema, effective: eff() },
      { attempts: 2 }
    );
    const s = out.items[0] as string;
    expect([...s]).toHaveLength(2);
    expect(s).toBe('A😀');
  });
});
