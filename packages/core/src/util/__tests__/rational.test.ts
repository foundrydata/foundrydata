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

  it('isMultipleWithEpsilon rejects NaN and infinities', () => {
    expect(isMultipleWithEpsilon(Number.NaN, 0.1, 12)).toBe(false);
    expect(isMultipleWithEpsilon(1, Number.NaN, 12)).toBe(false);
    expect(isMultipleWithEpsilon(Number.POSITIVE_INFINITY, 0.1, 12)).toBe(
      false
    );
    expect(isMultipleWithEpsilon(1, Number.POSITIVE_INFINITY, 12)).toBe(false);
    expect(isMultipleWithEpsilon(Number.NEGATIVE_INFINITY, 0.1, 12)).toBe(
      false
    );
    expect(isMultipleWithEpsilon(1, Number.NEGATIVE_INFINITY, 12)).toBe(false);
  });

  it('isMultipleWithEpsilon rejects non-positive multipleOf', () => {
    expect(isMultipleWithEpsilon(1, 0, 12)).toBe(false);
    expect(isMultipleWithEpsilon(1, -0.1, 12)).toBe(false);
  });

  it('isMultipleWithEpsilon handles subnormal multiples', () => {
    const step = Number.MIN_VALUE;
    const threeSteps = step * 3;
    expect(isMultipleWithEpsilon(step, step, 12)).toBe(true);
    expect(isMultipleWithEpsilon(threeSteps, step, 12)).toBe(true);
  });

  it('isMultipleWithEpsilon behaves sensibly near the precision boundary', () => {
    const multipleOf = 0.1;
    const prec = 6;
    const eps = 10 ** -prec;
    const base = multipleOf;
    const valueSlightlyAbove = base * (1 + eps * 1.1);
    const ok = isMultipleWithEpsilon(base, multipleOf, prec);
    const notOk = isMultipleWithEpsilon(valueSlightlyAbove, multipleOf, prec);
    expect(ok).toBe(true);
    expect(notOk).toBe(false);
  });

  it('isMultipleDecimalFallback handles NaN and non-positive multiples', () => {
    expect(isMultipleDecimalFallback(Number.NaN, 0.1, 12)).toBe(false);
    expect(isMultipleDecimalFallback(1, Number.NaN, 12)).toBe(false);
    expect(isMultipleDecimalFallback(1, 0, 12)).toBe(false);
    expect(isMultipleDecimalFallback(1, -0.1, 12)).toBe(false);
  });
});
