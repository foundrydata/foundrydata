import { describe, it, expect } from 'vitest';

import { createPlanningAjv } from '../../../util/ajv-planning.js';
import {
  createMultipleOfContext,
  isAjvMultipleOf,
  snapToNearestMultiple,
} from '../../numbers/multiple-of.js';

describe('numbers/multiple-of helpers', () => {
  it('matches Ajv multipleOf semantics for decimal fallback', () => {
    const ajv = createPlanningAjv(
      { multipleOfPrecision: 12 },
      { rational: { fallback: 'decimal', decimalPrecision: 12 } }
    );
    const schema = { type: 'number', multipleOf: 0.1 };
    const validate = ajv.compile(schema);
    const ctx = createMultipleOfContext({
      fallback: 'decimal',
      decimalPrecision: 12,
    });

    const values = [0.3, 0.3000000000001, 0.31, 1.2, 1.23];
    for (const value of values) {
      const ajvOk = validate(value);
      const helperOk = isAjvMultipleOf(value, 0.1, ctx);
      expect(helperOk).toBe(ajvOk);
    }
  });

  it('snaps to nearest multiple using configured precision', () => {
    const ctx = createMultipleOfContext({
      fallback: 'decimal',
      decimalPrecision: 4,
    });
    const snapped = snapToNearestMultiple(1.2345, 0.01, ctx);
    expect(snapped).toBeCloseTo(1.23, 2);
  });

  it('isAjvMultipleOf returns false for NaN and infinities', () => {
    const ctx = createMultipleOfContext({
      fallback: 'decimal',
      decimalPrecision: 12,
    });

    const values = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ];
    for (const value of values) {
      expect(isAjvMultipleOf(value, 0.1, ctx)).toBe(false);
    }
  });

  it('matches Ajv multipleOf semantics for subnormal multipleOf', () => {
    const multipleOf = Number.MIN_VALUE;
    const ajv = createPlanningAjv(
      { multipleOfPrecision: 12 },
      { rational: { fallback: 'decimal', decimalPrecision: 12 } }
    );
    const schema = { type: 'number', multipleOf };
    const validate = ajv.compile(schema);
    const ctx = createMultipleOfContext({
      fallback: 'decimal',
      decimalPrecision: 12,
    });

    const values = [0, multipleOf, multipleOf * 2, multipleOf * 3];
    for (const value of values) {
      const ajvOk = validate(value);
      const helperOk = isAjvMultipleOf(value, multipleOf, ctx);
      expect(helperOk).toBe(ajvOk);
    }
  });

  it('snapToNearestMultiple leaves NaN and infinities unchanged', () => {
    const ctx = createMultipleOfContext({
      fallback: 'decimal',
      decimalPrecision: 4,
    });
    const nanResult = snapToNearestMultiple(Number.NaN, 0.1, ctx);
    expect(Number.isNaN(nanResult)).toBe(true);
    expect(snapToNearestMultiple(Number.POSITIVE_INFINITY, 0.1, ctx)).toBe(
      Number.POSITIVE_INFINITY
    );
    expect(snapToNearestMultiple(Number.NEGATIVE_INFINITY, 0.1, ctx)).toBe(
      Number.NEGATIVE_INFINITY
    );
  });

  it('snapToNearestMultiple handles tiny and large steps', () => {
    const ctx = createMultipleOfContext({
      fallback: 'decimal',
      decimalPrecision: 9,
    });
    const tiny = snapToNearestMultiple(1e-8, 1e-9, ctx);
    expect(tiny).toBeCloseTo(1e-8, 12);

    const large = snapToNearestMultiple(1e20 + 0.4, 1, ctx);
    expect(Number.isFinite(large)).toBe(true);
    expect(Math.abs(large % 1)).toBeLessThanOrEqual(1e-6);
  });
});
