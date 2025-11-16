import { describe, it, expect } from 'vitest';
import { repairItemsAjvDriven } from '../../repair/repair-engine';
import type { ComposeResult } from '../../transform/composition-engine';
import { createSourceAjv } from '../../util/ajv-source';

function eff(): ComposeResult {
  const canonical = {
    schema: {},
    ptrMap: new Map<string, string>(),
    revPtrMap: new Map<string, string[]>(),
    notes: [],
  };
  return {
    canonical,
    coverageIndex: new Map(),
    containsBag: new Map(),
  } as unknown as ComposeResult;
}

function valid(schema: unknown, data: unknown): boolean {
  const ajv = createSourceAjv({ dialect: '2020-12' }, {});
  const v = ajv.compile(schema as any);
  return !!v(data);
}

describe('Repair Engine — contains repairs', () => {
  it('grows to satisfy minContains', () => {
    const schema = { type: 'array', contains: { const: 7 }, minContains: 2 };
    const out = repairItemsAjvDriven(
      [[7]],
      { schema, effective: eff() },
      { attempts: 2 }
    );
    const arr = out.items[0] as number[];
    expect(arr.filter((x) => x === 7).length).toBeGreaterThanOrEqual(2);
    expect(valid(schema, arr)).toBe(true);
  });

  it('reduces to satisfy maxContains', () => {
    const schema = {
      type: 'array',
      contains: { type: 'integer' },
      maxContains: 1,
    };
    const out = repairItemsAjvDriven(
      [[1, 2, 3]],
      { schema, effective: eff() },
      { attempts: 3 }
    );
    const arr = out.items[0] as number[];
    expect(arr.filter((x) => Number.isInteger(x)).length).toBeLessThanOrEqual(
      1
    );
    expect(valid(schema, arr)).toBe(true);
  });

  it('handles both minContains and maxContains', () => {
    const schema = {
      type: 'array',
      contains: { const: 'x' },
      minContains: 1,
      maxContains: 1,
    };
    const out = repairItemsAjvDriven(
      [['x', 'x', 'y']],
      { schema, effective: eff() },
      { attempts: 3 }
    );
    const arr = out.items[0] as string[];
    expect(arr.filter((x) => x === 'x').length).toBe(1);
    expect(valid(schema, arr)).toBe(true);
  });
});
