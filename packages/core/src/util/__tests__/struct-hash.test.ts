import { describe, it, expect } from 'vitest';
import { structuralHash, bucketsEqual } from '../struct-hash';

describe('structuralHash', () => {
  it('produces identical digests for structurally equivalent objects', () => {
    const first = { b: [2, 1], a: 1 };
    const second = { a: 1, b: [2, 1] };

    const hashA = structuralHash(first);
    const hashB = structuralHash(second);

    expect(hashA.digest).toBe(hashB.digest);
    expect(hashA.canonical).toBe(hashB.canonical);
  });

  it('normalizes negative zero to zero in canonical output', () => {
    const minusZero = structuralHash([-0]);
    const zero = structuralHash([0]);

    expect(minusZero.digest).toBe(zero.digest);
    expect(minusZero.canonical).toBe('[0]');
  });

  it('serializes bigint values using the jsonSafeReplacer semantics', () => {
    const result = structuralHash({ big: 42n });
    expect(result.canonical).toContain('"42"');
  });
});

describe('bucketsEqual', () => {
  it('detects deep equality within hash buckets', () => {
    const bucket = [{ x: { y: 1 } }, ['a', 'b']];
    expect(bucketsEqual(bucket, { x: { y: 1 } })).toBe(true);
    expect(bucketsEqual(bucket, ['a', 'b'])).toBe(true);
    expect(bucketsEqual(bucket, { x: { y: 2 } })).toBe(false);
  });
});
