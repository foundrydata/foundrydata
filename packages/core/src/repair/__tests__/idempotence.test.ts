import { describe, it, expect } from 'vitest';
import { repairItemsAjvDriven } from '../../repair/repair-engine';

function eff(): any {
  return {
    canonical: { revPtrMap: new Map<string, string[]>([['#', ['#']]]) },
    coverageIndex: new Map(),
  };
}

describe('Repair Engine — idempotence', () => {
  it('string length repairs are idempotent', () => {
    const schema = { type: 'string', minLength: 3 } as const;
    const first = repairItemsAjvDriven(
      ['a'],
      { schema, effective: eff() },
      { attempts: 2 }
    );
    const second = repairItemsAjvDriven(
      first.items as string[],
      { schema, effective: eff() },
      { attempts: 2 }
    );
    expect(second.items[0]).toEqual(first.items[0]);
  });

  it('propertyNames enum rename is idempotent', () => {
    const schema = {
      type: 'object',
      // no AP:false here to keep must-cover guard off for this simple test
      propertyNames: { enum: ['a', 'b'] },
    } as const;
    const first = repairItemsAjvDriven(
      [{ bad: 1 }],
      { schema, effective: eff() },
      { attempts: 2 }
    );
    const second = repairItemsAjvDriven(
      first.items as unknown[],
      { schema, effective: eff() },
      { attempts: 2 }
    );
    expect(second.items[0]).toEqual(first.items[0]);
  });
});
