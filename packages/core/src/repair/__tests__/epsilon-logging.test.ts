import { describe, it, expect } from 'vitest';
import {
  formatEpsilon,
  nudgeDetailsForExclusive,
} from '../../repair/repair-engine';

describe('Repair Engine — epsilon logging helpers', () => {
  it('formats epsilon exactly as 1e-<precision>', () => {
    expect(formatEpsilon(12)).toBe('1e-12');
    expect(formatEpsilon(1)).toBe('1e-1');
    expect(formatEpsilon(3.9)).toBe('1e-3');
  });

  it('clamps epsilon precision to [1,100]', () => {
    expect(formatEpsilon(0)).toBe('1e-1');
    expect(formatEpsilon(-5)).toBe('1e-1');
    expect(formatEpsilon(101)).toBe('1e-100');
    expect(formatEpsilon(1_000)).toBe('1e-100');
  });

  it('returns delta for integer exclusive nudges', () => {
    const up = nudgeDetailsForExclusive({
      integer: true,
      decimalPrecision: 12,
      direction: 'up',
    });
    const down = nudgeDetailsForExclusive({
      integer: true,
      decimalPrecision: 12,
      direction: 'down',
    });
    expect(up).toEqual({ delta: 1 });
    expect(down).toEqual({ delta: -1 });
  });

  it('returns epsilon string for non-integer exclusive nudges', () => {
    const r = nudgeDetailsForExclusive({
      integer: false,
      decimalPrecision: 12,
      direction: 'up',
    });
    expect(r).toEqual({ epsilon: '1e-12' });
  });
});
