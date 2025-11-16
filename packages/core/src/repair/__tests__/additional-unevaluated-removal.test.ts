import { describe, it, expect } from 'vitest';
import { repairItemsAjvDriven } from '../../repair/repair-engine';

function eff(): any {
  return {
    canonical: { revPtrMap: new Map<string, string[]>([['#', ['#']]]) },
    coverageIndex: new Map(),
  };
}

describe('Repair Engine — removal under additionalProperties/unevaluatedProperties', () => {
  it('removes additional properties when additionalProperties:false applies', () => {
    const schema = {
      type: 'object',
      properties: { a: { type: 'number' } },
      additionalProperties: false,
    } as const;
    const items = [{ a: 1, x: 2 }];
    const out = repairItemsAjvDriven(
      items,
      { schema, effective: eff() },
      { attempts: 2 }
    );
    const obj = out.items[0] as Record<string, unknown>;
    expect(obj).toHaveProperty('a', 1);
    expect(obj).not.toHaveProperty('x');
  });

  it('removes unevaluated properties when unevaluatedProperties:false applies', () => {
    const schema = {
      type: 'object',
      properties: { a: { type: 'number' } },
      unevaluatedProperties: false,
    } as const;
    const items = [{ a: 1, y: 3 }];
    const out = repairItemsAjvDriven(
      items,
      { schema, effective: eff() },
      { attempts: 2 }
    );
    const obj = out.items[0] as Record<string, unknown>;
    expect(obj).toHaveProperty('a', 1);
    expect(obj).not.toHaveProperty('y');
  });
});
