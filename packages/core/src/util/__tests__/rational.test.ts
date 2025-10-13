import { describe, it, expect } from 'vitest';
import {
  gcd,
  lcm,
  reduce,
  quantizeDecimal,
  isMultipleWithEpsilon,
  isMultipleDecimalFallback,
} from '../rational';

describe('rational helpers', () => {
  it('gcd computes correct greatest common divisor', () => {
    expect(gcd(54n, 24n)).toBe(6n);
    expect(gcd(24n, 54n)).toBe(6n);
    expect(gcd(7n, 13n)).toBe(1n);
    expect(gcd(-12n, 18n)).toBe(6n);
  });

  it('lcm computes correct least common multiple', () => {
    expect(lcm(4n, 6n)).toBe(12n);
    expect(lcm(7n, 13n)).toBe(91n);
    expect(lcm(0n, 5n)).toBe(0n);
  });

  it('reduce normalizes sign and divides by gcd', () => {
    expect(reduce(8n, 12n)).toEqual({ p: 2n, q: 3n });
    expect(reduce(-8n, 12n)).toEqual({ p: -2n, q: 3n });
    expect(reduce(8n, -12n)).toEqual({ p: -2n, q: 3n });
  });

  it('quantizeDecimal uses bankers rounding', () => {
    // 1.225 at 2 dp -> half even -> 1.22
    expect(quantizeDecimal(1.225, 2)).toBe(1.22);
    // 1.235 at 2 dp -> half even -> 1.24
    expect(quantizeDecimal(1.235, 2)).toBe(1.24);
  });

  it('isMultipleWithEpsilon handles IEEE-754 imprecision', () => {
    expect(isMultipleWithEpsilon(0.3, 0.1, 12)).toBe(true);
    expect(isMultipleWithEpsilon(1.234, 0.01, 12)).toBe(false);
  });

  it('isMultipleDecimalFallback quantizes operands before test', () => {
    // After quantization at 2 dp, 1.23 / 0.01 = 123 exactly
    expect(isMultipleDecimalFallback(1.23, 0.01, 2)).toBe(true);
  });
});
