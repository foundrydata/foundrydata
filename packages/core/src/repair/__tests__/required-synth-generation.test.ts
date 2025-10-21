import { describe, it, expect } from 'vitest';
import { repairItemsAjvDriven } from '../../repair/repair-engine';

function eff(): any {
  return {
    canonical: { revPtrMap: new Map<string, string[]>([['#', ['#']]]) },
    coverageIndex: new Map(),
  };
}

describe('Repair Engine — required without default minimal generation', () => {
  it('adds minimal representative when required property lacks default', () => {
    const schema = {
      type: 'object',
      properties: { b: { type: 'integer' } },
      required: ['b'],
    } as const;
    const out = repairItemsAjvDriven(
      [{}],
      { schema, effective: eff() },
      { attempts: 2 }
    );
    const obj = out.items[0] as Record<string, unknown>;
    expect(obj).toHaveProperty('b', 0);
  });
});
