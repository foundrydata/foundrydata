import { describe, expect, it } from 'vitest';
import { stableParamsKey } from '../stable-params-key.js';

describe('stableParamsKey', () => {
  it('produces identical keys for objects with different key order', () => {
    const a = { a: 1, b: 2 };
    const b = { b: 2, a: 1 };

    const ka = stableParamsKey(a);
    const kb = stableParamsKey(b);

    expect(ka).toBe(kb);
  });

  it('distinguishes structurally different params', () => {
    const a = { a: 1, b: 2 };
    const b = { a: 1, b: 3 };

    const ka = stableParamsKey(a);
    const kb = stableParamsKey(b);

    expect(ka).not.toBe(kb);
  });

  it('preserves array order in the key', () => {
    const a = [1, 2, 3];
    const b = [3, 2, 1];

    const ka = stableParamsKey(a);
    const kb = stableParamsKey(b);

    expect(ka).not.toBe(kb);
  });

  it('normalizes -0 to 0 in numeric values', () => {
    const a = { value: -0 };
    const b = { value: 0 };

    const ka = stableParamsKey(a);
    const kb = stableParamsKey(b);

    expect(ka).toBe(kb);
  });

  it('handles nested objects and arrays deterministically', () => {
    const a = {
      min: 1,
      max: 10,
      nested: { items: [1, 2, 3], flag: true },
    };
    const b = {
      nested: { flag: true, items: [1, 2, 3] },
      max: 10,
      min: 1,
    };

    const ka = stableParamsKey(a);
    const kb = stableParamsKey(b);

    expect(ka).toBe(kb);
  });

  it('accepts primitive params', () => {
    expect(stableParamsKey(null)).toBe('null');
    expect(stableParamsKey(true)).toBe('true');
    expect(stableParamsKey(false)).toBe('false');
    expect(stableParamsKey(5)).toBe('5');
    expect(stableParamsKey('abc')).toBe('"abc"');
  });
});
