// Normative RNG utilities (see docs §15: Performance, Determinism & Metrics)

/**
 * 32-bit FNV-1a hash of a string over UTF-16 code units.
 * offset-basis: 2166136261, prime: 16777619, modulo 2^32
 */
export function fnv1a32(s: string): number {
  let x = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    x ^= s.charCodeAt(i);
    x = Math.imul(x, 16777619) >>> 0;
  }
  return x >>> 0;
}

/**
 * Normative xorshift32 RNG with uint32 state.
 * Initialization: x = (seed >>> 0) ^ fnv1a32(canonPtr)
 * Step: x ^= x << 13; x ^= x >>> 17; x ^= x << 5; (all masked to uint32)
 * next() returns x >>> 0
 */
export class XorShift32 {
  private x: number;

  constructor(seed: number, canonPtr: string) {
    this.x = ((seed >>> 0) ^ fnv1a32(canonPtr)) >>> 0;
  }

  /** Returns the next uint32 value. */
  next(): number {
    let x = this.x >>> 0;
    x ^= (x << 13) >>> 0;
    x ^= x >>> 17;
    x ^= (x << 5) >>> 0;
    this.x = x >>> 0;
    return this.x;
  }

  /** Returns a deterministic float in [0, 1). */
  nextFloat01(): number {
    return (this.next() >>> 0) / 0x100000000;
  }
}
