import { isMultipleWithEpsilon, quantizeDecimal } from '../../util/rational.js';
import type { RationalOptions } from '../../types/options.js';

export type MultipleOfFallbackKind = 'exact' | 'decimal' | 'float';

export interface MultipleOfContext {
  decimalPrecision: number;
  fallback: MultipleOfFallbackKind;
}

export function createMultipleOfContext(
  rational: RationalOptions | undefined
): MultipleOfContext {
  const decimalPrecision = Math.max(
    1,
    Math.floor(rational?.decimalPrecision ?? 12)
  );
  const fallback: MultipleOfFallbackKind =
    rational?.fallback === 'decimal' || rational?.fallback === 'float'
      ? rational.fallback
      : 'exact';
  return { decimalPrecision, fallback };
}

export function isAjvMultipleOf(
  value: number,
  multipleOf: number,
  ctx: MultipleOfContext
): boolean {
  if (!Number.isFinite(value) || !Number.isFinite(multipleOf)) return false;
  if (multipleOf === 0) return false;
  const m = Math.abs(multipleOf);
  // Ajv uses an epsilon-based multipleOfPrecision rule on the
  // ratio x/m, independent of the pipeline's decimal/float
  // fallback policy. Mirror that behavior here.
  return isMultipleWithEpsilon(value, m, ctx.decimalPrecision);
}

export function snapToNearestMultiple(
  value: number,
  multipleOf: number,
  ctx: MultipleOfContext
): number {
  if (!Number.isFinite(value) || !Number.isFinite(multipleOf)) {
    return value;
  }
  if (multipleOf === 0) {
    return value;
  }
  const m = Math.abs(multipleOf);
  const k = Math.round(value / m);
  let snapped = k * m;
  if (!Number.isFinite(snapped)) {
    return value;
  }
  if (ctx.fallback === 'decimal') {
    snapped = quantizeDecimal(snapped, ctx.decimalPrecision);
  }
  return snapped;
}
