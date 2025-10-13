import { describe, it, expect } from 'vitest';
import { jsonSafeReplacer, toJSONSafeRat } from '../json-safe';

describe('json-safe utilities', () => {
  it('jsonSafeReplacer stringifies BigInt', () => {
    const obj = { a: 1n, b: 2 } as const;
    const s = JSON.stringify(obj, jsonSafeReplacer);
    expect(s).toContain('"a":"1"');
    expect(s).toContain('"b":2');
  });

  it('toJSONSafeRat renders bigint pair as strings', () => {
    expect(toJSONSafeRat(5n, 8n)).toEqual({ num: '5', den: '8' });
  });
});
