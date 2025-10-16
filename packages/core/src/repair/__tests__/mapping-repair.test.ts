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
  const effective = {
    canonical,
    containsBag: new Map(),
    coverageIndex: new Map(),
  } as unknown as ComposeResult;
  return effective;
}

function valid(schema: unknown, data: unknown): boolean {
  const ajv = createSourceAjv({ dialect: '2020-12' }, {});
  const v = ajv.compile(schema as any);
  return !!v(data);
}

describe('Repair Engine — §10 mapping repairs (basic)', () => {
  it('repairs enum by choosing first member', () => {
    const schema = { type: 'string', enum: ['A', 'B', 'C'] };
    const out = repairItemsAjvDriven(
      ['x'],
      { schema, effective: eff() },
      { attempts: 2 }
    );
    expect(out.items[0]).toBe('A');
    expect(valid(schema, out.items[0])).toBe(true);
  });

  it('repairs const by setting the const value', () => {
    const schema = { const: 42 };
    const out = repairItemsAjvDriven(
      ['nope'],
      { schema, effective: eff() },
      { attempts: 2 }
    );
    expect(out.items[0]).toBe(42);
    expect(valid(schema, out.items[0])).toBe(true);
  });

  it('repairs type using minimal representative', () => {
    const schema = { type: 'integer' };
    const out = repairItemsAjvDriven(
      ['bad'],
      { schema, effective: eff() },
      { attempts: 2 }
    );
    expect(out.items[0]).toBe(0);
    expect(valid(schema, out.items[0])).toBe(true);
  });

  it('repairs pattern with simple alternation by picking first literal', () => {
    const schema = { type: 'string', pattern: '^(?:alpha|beta)$' };
    const out = repairItemsAjvDriven(
      ['zzz'],
      { schema, effective: eff() },
      { attempts: 2 }
    );
    expect(out.items[0]).toBe('alpha');
    expect(valid(schema, out.items[0])).toBe(true);
  });

  it('repairs pattern with word-class and exact quantifier {m}', () => {
    const schema = { type: 'string', pattern: '^\\w{3}$' };
    const out = repairItemsAjvDriven(
      [''],
      { schema, effective: eff() },
      { attempts: 2 }
    );
    expect(typeof out.items[0]).toBe('string');
    expect((out.items[0] as string).length).toBe(3);
    expect(valid(schema, out.items[0])).toBe(true);
  });

  it('repairs pattern with digit class and range quantifier {2,4}', () => {
    const schema = { type: 'string', pattern: '^\\d{2,4}$' };
    const out = repairItemsAjvDriven(
      ['x'],
      { schema, effective: eff() },
      { attempts: 2 }
    );
    expect(typeof out.items[0]).toBe('string');
    expect((out.items[0] as string).length).toBeGreaterThanOrEqual(2);
    expect(valid(schema, out.items[0])).toBe(true);
  });

  it('de-duplicates uniqueItems arrays and shrinks by maxItems', () => {
    const schema = { type: 'array', uniqueItems: true, maxItems: 2 };
    const out = repairItemsAjvDriven(
      [[1, 1, 2, 2]],
      { schema, effective: eff() },
      { attempts: 2 }
    );
    expect(Array.isArray(out.items[0])).toBe(true);
    const arr = out.items[0] as number[];
    expect(arr.length).toBe(2);
    expect(new Set(arr).size).toBe(arr.length);
    expect(valid(schema, arr)).toBe(true);
  });

  it('grows arrays to satisfy minItems when possible', () => {
    const schema = {
      type: 'array',
      items: { type: 'integer', default: 1 },
      minItems: 3,
    };
    const out = repairItemsAjvDriven(
      [[1]],
      { schema, effective: eff() },
      { attempts: 2 }
    );
    const arr = out.items[0] as number[];
    expect(arr.length).toBe(3);
    expect(valid(schema, arr)).toBe(true);
  });
});
