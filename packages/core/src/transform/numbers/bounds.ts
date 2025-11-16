export type NumericKind = 'integer' | 'number';

export interface NumericKeywordBounds {
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
}

export type NumericBoundsReason = 'rangeEmpty' | 'integerDomainEmpty';

export interface NumericBoundsCheckInput extends NumericKeywordBounds {
  kind: NumericKind;
}

export interface NumericBoundsCheckResult {
  contradictory: boolean;
  reason?: NumericBoundsReason;
}

export function isNumericLikeSchema(schema: Record<string, unknown>): boolean {
  const typeValue = schema.type;
  if (typeValue === 'number' || typeValue === 'integer') return true;
  if (Array.isArray(typeValue)) {
    if (typeValue.includes('number') || typeValue.includes('integer')) {
      return true;
    }
  }
  if (
    typeof schema.minimum === 'number' ||
    typeof schema.maximum === 'number' ||
    typeof schema.exclusiveMinimum === 'number' ||
    typeof schema.exclusiveMaximum === 'number' ||
    typeof schema.multipleOf === 'number'
  ) {
    return true;
  }
  return false;
}

export function determineNumericKind(
  schema: Record<string, unknown>
): NumericKind | undefined {
  const typeValue = schema.type;
  if (typeValue === 'integer') return 'integer';
  if (typeValue === 'number') return 'number';
  if (Array.isArray(typeValue)) {
    const hasInteger = typeValue.includes('integer');
    const hasNumber = typeValue.includes('number');
    if (hasInteger && !hasNumber) return 'integer';
    if (hasNumber) return 'number';
  }
  if (
    typeof schema.minimum === 'number' ||
    typeof schema.maximum === 'number' ||
    typeof schema.exclusiveMinimum === 'number' ||
    typeof schema.exclusiveMaximum === 'number'
  ) {
    return 'number';
  }
  return undefined;
}

export function checkNumericBounds(
  input: NumericBoundsCheckInput
): NumericBoundsCheckResult {
  const { kind } = input;
  const lower = resolveLowerBound(input);
  const upper = resolveUpperBound(input);

  if (lower && upper) {
    if (lower.value > upper.value) {
      return { contradictory: true, reason: 'rangeEmpty' };
    }
    if (lower.value === upper.value && (lower.exclusive || upper.exclusive)) {
      return { contradictory: true, reason: 'rangeEmpty' };
    }
  }

  if (kind === 'integer') {
    const intLower = integerLowerFromBound(lower);
    const intUpper = integerUpperFromBound(upper);
    if (intLower !== undefined && intUpper !== undefined) {
      if (intLower > intUpper) {
        return { contradictory: true, reason: 'integerDomainEmpty' };
      }
    }
  }

  return { contradictory: false };
}

interface NormalizedBound {
  value: number;
  exclusive: boolean;
}

function resolveLowerBound(
  bounds: NumericKeywordBounds
): NormalizedBound | undefined {
  const inclusive =
    typeof bounds.minimum === 'number'
      ? { value: bounds.minimum, exclusive: false }
      : undefined;
  const exclusive =
    typeof bounds.exclusiveMinimum === 'number'
      ? { value: bounds.exclusiveMinimum, exclusive: true }
      : undefined;
  if (!inclusive) return exclusive;
  if (!exclusive) return inclusive;
  if (exclusive.value > inclusive.value) return exclusive;
  if (exclusive.value < inclusive.value) return inclusive;
  return { value: inclusive.value, exclusive: true };
}

function resolveUpperBound(
  bounds: NumericKeywordBounds
): NormalizedBound | undefined {
  const inclusive =
    typeof bounds.maximum === 'number'
      ? { value: bounds.maximum, exclusive: false }
      : undefined;
  const exclusive =
    typeof bounds.exclusiveMaximum === 'number'
      ? { value: bounds.exclusiveMaximum, exclusive: true }
      : undefined;
  if (!inclusive) return exclusive;
  if (!exclusive) return inclusive;
  if (exclusive.value < inclusive.value) return exclusive;
  if (exclusive.value > inclusive.value) return inclusive;
  return { value: inclusive.value, exclusive: true };
}

function integerLowerFromBound(
  bound: NormalizedBound | undefined
): number | undefined {
  if (!bound) return undefined;
  if (!Number.isFinite(bound.value)) return undefined;
  if (bound.exclusive) {
    return Math.floor(bound.value) + 1;
  }
  return Math.ceil(bound.value);
}

function integerUpperFromBound(
  bound: NormalizedBound | undefined
): number | undefined {
  if (!bound) return undefined;
  if (!Number.isFinite(bound.value)) return undefined;
  if (bound.exclusive) {
    return Math.ceil(bound.value) - 1;
  }
  return Math.floor(bound.value);
}
