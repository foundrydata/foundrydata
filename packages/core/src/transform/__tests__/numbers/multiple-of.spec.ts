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
});
