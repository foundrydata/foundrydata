import { describe, it, expect } from 'vitest';
import { repairItemsAjvDriven } from '../../repair/repair-engine';
import { createSourceAjv } from '../../util/ajv-source';

function makeEffective(): any {
  return {
    canonical: { revPtrMap: new Map<string, string[]>() },
    coverageIndex: new Map(),
  };
}

function validateAgainst(schema: any, value: any): boolean {
  const ajv = createSourceAjv({ dialect: '2020-12' }, {});
  const validate = ajv.compile(schema);
  return !!validate(value);
}

describe('Repair Engine — numeric nudges and snapping', () => {
  it('nudges exclusiveMinimum for number via epsilon', () => {
    const schema = { type: 'number', exclusiveMinimum: 5 };
    const items = [5];
    const out = repairItemsAjvDriven(
      items,
      { schema, effective: makeEffective() },
      { attempts: 2 }
    );
    expect(out.items[0]).toBeGreaterThan(5);
    expect(validateAgainst(schema, out.items[0])).toBe(true);
  });

  it('nudges exclusiveMaximum for integer via ±1', () => {
    const schema = { type: 'integer', exclusiveMaximum: 10 };
    const items = [10];
    const out = repairItemsAjvDriven(
      items,
      { schema, effective: makeEffective() },
      { attempts: 2 }
    );
    expect(out.items[0]).toBe(9);
    expect(validateAgainst(schema, out.items[0])).toBe(true);
  });

  it('clamps maximum inclusive', () => {
    const schema = { type: 'number', maximum: 3 };
    const items = [7];
    const out = repairItemsAjvDriven(
      items,
      { schema, effective: makeEffective() },
      { attempts: 1 }
    );
    expect(out.items[0]).toBe(3);
    expect(validateAgainst(schema, out.items[0])).toBe(true);
  });

  it('snaps to nearest multipleOf', () => {
    const schema = { type: 'number', multipleOf: 0.2 };
    const items = [0.3];
    const out = repairItemsAjvDriven(
      items,
      { schema, effective: makeEffective() },
      { attempts: 2 }
    );
    expect(validateAgainst(schema, out.items[0])).toBe(true);
  });
});
