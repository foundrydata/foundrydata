import { describe, it, expect } from 'vitest';
import { repairItemsAjvDriven } from '../../repair/repair-engine';

function eff(): any {
  return {
    canonical: { revPtrMap: new Map<string, string[]>([['#', ['#']]]) },
    coverageIndex: new Map(),
  };
}

describe('Repair Engine — pattern synthesis edge branches', () => {
  it('repairs anchored literal ^foo$', () => {
    const schema = { type: 'string', pattern: '^foo$' } as const;
    const out = repairItemsAjvDriven(
      ['x'],
      { schema, effective: eff() },
      { attempts: 1 }
    );
    expect(out.items[0]).toBe('foo');
  });

  // Note: '^.*$' matches any string, so no Ajv 'pattern' error is produced; no repair needed.
});
