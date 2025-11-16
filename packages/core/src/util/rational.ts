// REFONLY::{"anchors":["spec://§8#numbers-multipleof","spec://§23#plan-options"],"summary":"Exact rational helpers with capped fallbacks and epsilon acceptance"}

export type Rat = { p: bigint; q: bigint };

export function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

export function lcm(a: bigint, b: bigint): bigint {
  if (a === 0n || b === 0n) return 0n;
  return (a / gcd(a, b)) * b;
}

export function reduce(p: bigint, q: bigint): Rat {
  if (q === 0n) throw new Error('Denominator must be non-zero');
  if (q < 0n) {
    p = -p;
    q = -q;
  }
  const g = gcd(p < 0n ? -p : p, q);
  return { p: p / g, q: q / g };
}

// Bankers rounding (round-half-even) at a given decimal precision
export function quantizeDecimal(x: number, precision: number): number {
  if (!Number.isFinite(x)) return x;
  const factor = 10 ** precision;
  const scaled = x * factor;
  const floor = Math.floor(scaled);
  const frac = scaled - floor;
  const tol = 1e-12; // tolerate binary rounding noise when testing for ties
  if (frac > 0.5 + tol) return (floor + 1) / factor;
  if (frac < 0.5 - tol) return floor / factor;
  // exactly half -> round to even
  return (floor % 2 === 0 ? floor : floor + 1) / factor;
}

// Epsilon acceptance check used by decimal/float fallbacks
export function isMultipleWithEpsilon(
  value: number,
  multipleOf: number,
  decimalPrecision: number
): boolean {
  if (!Number.isFinite(value) || !Number.isFinite(multipleOf)) return false;
  if (multipleOf <= 0) return false;
  const eps = 10 ** -decimalPrecision;
  const ratio = value / multipleOf;
  return Math.abs(ratio - Math.round(ratio)) < eps;
}

// Decimal fallback policy: quantize operands, then apply epsilon rule
export function isMultipleDecimalFallback(
  value: number,
  multipleOf: number,
  decimalPrecision: number
): boolean {
  const vq = quantizeDecimal(value, decimalPrecision);
  const mq = quantizeDecimal(multipleOf, decimalPrecision);
  if (mq <= 0) return false;
  const eps = 10 ** -decimalPrecision;
  const r = vq / mq;
  return Math.abs(r - Math.round(r)) < eps;
}
