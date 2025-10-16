import { describe, it, expect } from 'vitest';
import { repairItemsAjvDriven } from '../../repair/repair-engine';

function eff(): any {
  return {
    canonical: { revPtrMap: new Map<string, string[]>([['#', ['#']]]) },
  };
}

describe('Repair Engine — propertyNames simple enum rename (AJV-driven)', () => {
  it('renames to smallest non-present enum member when AP:false does not apply', () => {
    const schema = {
      type: 'object',
      // AP not false here – must-cover guard not required
      propertyNames: { enum: ['a', 'b', 'c'] },
    } as const;
    const items = [{ bad: 1, b: 2 }];
    const out = repairItemsAjvDriven(
      items,
      { schema, effective: eff() },
      { attempts: 1 }
    );
    const obj = out.items[0] as Record<string, unknown>;
    expect(obj).not.toHaveProperty('bad');
    // 'a' is the smallest not-present among ['a','b','c'] given 'b' present
    expect(obj).toHaveProperty('a', 1);
  });
});
