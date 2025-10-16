import { describe, it, expect } from 'vitest';
import { repairItemsAjvDriven } from '../../repair/repair-engine';

function makeEffective(): any {
  return {
    canonical: { revPtrMap: new Map<string, string[]>([['#', ['#']]]) },
    coverageIndex: new Map(),
  };
}

describe('Repair Engine — numeric action details logging', () => {
  it('records delta for integer exclusiveMaximum nudge', () => {
    const schema = { type: 'integer', exclusiveMaximum: 10 } as const;
    const items = [10];
    const out = repairItemsAjvDriven(
      items,
      { schema, effective: makeEffective() },
      { attempts: 1 }
    );
    const act = out.actions.find((a) => a.action === 'numericNudge');
    expect(act).toBeDefined();
    expect(act!.details).toMatchObject({ kind: 'exclusiveMaximum', delta: -1 });
  });

  it('records epsilon string for multipleOf snapping', () => {
    const schema = { type: 'number', multipleOf: 0.2 } as const;
    const items = [0.3];
    const out = repairItemsAjvDriven(
      items,
      { schema, effective: makeEffective() },
      { attempts: 2 }
    );
    const act = out.actions.find((a) => a.action === 'multipleOfSnap');
    expect(act).toBeDefined();
    expect(typeof act!.details?.epsilon).toBe('string');
    expect((act!.details as any).epsilon).toMatch(/^1e-\d+$/);
  });
});
