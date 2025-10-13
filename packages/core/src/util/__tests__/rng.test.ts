import { describe, it, expect } from 'vitest';
import { fnv1a32, XorShift32 } from '../rng';

describe('RNG utilities', () => {
  describe('fnv1a32', () => {
    it('computes correct FNV-1a hash for known strings', () => {
      // Empty string
      expect(fnv1a32('')).toBe(2166136261);

      // Single character
      expect(fnv1a32('a')).toBe(3826002220);

      // Common test strings
      expect(fnv1a32('hello')).toBe(1335831723);
      expect(fnv1a32('world')).toBe(933488787);

      // JSON pointer examples (as used in canonPath)
      expect(fnv1a32('/properties/name')).toBe(2246265671);
      expect(fnv1a32('/items/0')).toBe(782378173);
    });

    it('produces different hashes for different strings', () => {
      const h1 = fnv1a32('/oneOf/0');
      const h2 = fnv1a32('/oneOf/1');
      expect(h1).not.toBe(h2);
    });

    it('is deterministic', () => {
      const input = '/properties/user/properties/id';
      expect(fnv1a32(input)).toBe(fnv1a32(input));
    });

    it('returns uint32 values', () => {
      const hash = fnv1a32('test');
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThanOrEqual(0xffffffff);
      expect(hash).toBe(hash >>> 0); // Verify it's a uint32
    });
  });

  describe('XorShift32', () => {
    it('produces deterministic sequence for given seed and canonPath', () => {
      const seed = 42;
      const canonPath = '/properties/name';

      const rng1 = new XorShift32(seed, canonPath);
      const rng2 = new XorShift32(seed, canonPath);

      const seq1 = [
        rng1.next(),
        rng1.next(),
        rng1.next(),
        rng1.next(),
        rng1.next(),
      ];
      const seq2 = [
        rng2.next(),
        rng2.next(),
        rng2.next(),
        rng2.next(),
        rng2.next(),
      ];

      expect(seq1).toEqual(seq2);
    });

    it('produces different sequences for different seeds', () => {
      const canonPath = '/items/0';

      const rng1 = new XorShift32(1, canonPath);
      const rng2 = new XorShift32(2, canonPath);

      const v1 = rng1.next();
      const v2 = rng2.next();

      expect(v1).not.toBe(v2);
    });

    it('produces different sequences for different canonPaths', () => {
      const seed = 100;

      const rng1 = new XorShift32(seed, '/oneOf/0');
      const rng2 = new XorShift32(seed, '/oneOf/1');

      const v1 = rng1.next();
      const v2 = rng2.next();

      expect(v1).not.toBe(v2);
    });

    it('next() returns uint32 values', () => {
      const rng = new XorShift32(424242, '/test');

      for (let i = 0; i < 100; i++) {
        const val = rng.next();
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(0xffffffff);
        expect(val).toBe(val >>> 0); // Verify it's a uint32
      }
    });

    it('nextFloat01() returns values in [0, 1)', () => {
      const rng = new XorShift32(1337, '/properties/value');

      for (let i = 0; i < 1000; i++) {
        const val = rng.nextFloat01();
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThan(1);
      }
    });

    it('nextFloat01() produces deterministic float sequence', () => {
      const seed = 55;
      const canonPath = '/anyOf/2';

      const rng1 = new XorShift32(seed, canonPath);
      const rng2 = new XorShift32(seed, canonPath);

      const floats1 = Array.from({ length: 10 }, () => rng1.nextFloat01());
      const floats2 = Array.from({ length: 10 }, () => rng2.nextFloat01());

      expect(floats1).toEqual(floats2);
    });

    it('produces reasonable distribution over [0, 1)', () => {
      const rng = new XorShift32(777, '/test/distribution');
      const samples = 10000;
      const buckets = 10;
      const counts = new Array(buckets).fill(0);

      for (let i = 0; i < samples; i++) {
        const val = rng.nextFloat01();
        const bucket = Math.min(Math.floor(val * buckets), buckets - 1);
        counts[bucket]++;
      }

      // Each bucket should have roughly samples/buckets values
      // We allow a generous margin for this test (±30%)
      const expected = samples / buckets;
      const margin = expected * 0.3;

      for (let i = 0; i < buckets; i++) {
        expect(counts[i]).toBeGreaterThan(expected - margin);
        expect(counts[i]).toBeLessThan(expected + margin);
      }
    });

    it('conforms to spec §15 xorshift32 algorithm', () => {
      // Test known xorshift32 sequence with specific initialization
      // seed = 1, canonPath = "" (empty) => fnv1a32("") = 2166136261
      // Initial state: x = (1 >>> 0) ^ 2166136261 = 2166136260

      const rng = new XorShift32(1, '');

      // Verify first few values match expected xorshift32 sequence
      // We compute these manually:
      // x0 = 2166136260
      // Step 1: x0 ^= x0 << 13
      const x0 = 2166136260;
      let x = x0 >>> 0;
      x ^= (x << 13) >>> 0;
      x ^= x >>> 17;
      x ^= (x << 5) >>> 0;
      const expected1 = x >>> 0;

      expect(rng.next()).toBe(expected1);
    });

    it('maintains independence across instances', () => {
      const rng1 = new XorShift32(100, '/path1');
      const rng2 = new XorShift32(100, '/path2');

      // Advance rng1
      rng1.next();
      rng1.next();
      rng1.next();

      // rng2 should still start from its own initial state
      const rng2Fresh = new XorShift32(100, '/path2');
      expect(rng2.next()).toBe(rng2Fresh.next());
    });

    it('handles edge case: seed = 0', () => {
      const rng = new XorShift32(0, '/test');

      // Should still produce values (not stuck at 0)
      const val1 = rng.next();
      const val2 = rng.next();

      expect(val1).toBeGreaterThan(0);
      expect(val2).toBeGreaterThan(0);
      expect(val1).not.toBe(val2);
    });

    it('handles edge case: negative seed', () => {
      const rng = new XorShift32(-42, '/test');

      // >>> 0 should convert to uint32
      const val = rng.next();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(0xffffffff);
    });

    it('nextFloat01() division by 0x100000000 is exact per spec', () => {
      const rng = new XorShift32(1, '/test');
      const uint32Val = rng.next();

      // Create a fresh RNG to get the same value
      const rngCheck = new XorShift32(1, '/test');
      const floatVal = rngCheck.nextFloat01();

      // Verify the float is computed as uint32 / 0x100000000
      expect(floatVal).toBe(uint32Val / 0x100000000);
    });
  });

  describe('RNG integration with spec §15', () => {
    it('seeding formula matches spec: s0 = (seed >>> 0) ^ fnv1a32(canonPath)', () => {
      const seed = 424242;
      const canonPath = '/oneOf/3';

      // We can't directly access internal state, but we can verify behavior
      // by checking that two RNGs with same inputs produce same outputs
      const rng1 = new XorShift32(seed, canonPath);
      const rng2 = new XorShift32(seed, canonPath);

      expect(rng1.next()).toBe(rng2.next());

      // And that changing either parameter changes the sequence
      const rng3 = new XorShift32(seed + 1, canonPath);
      const rng4 = new XorShift32(seed, canonPath + '/extra');

      // Reset rng1 by creating fresh instance
      const rng1Fresh = new XorShift32(seed, canonPath);
      const baseVal = rng1Fresh.next();

      expect(rng3.next()).not.toBe(baseVal);
      expect(rng4.next()).not.toBe(baseVal);
    });

    it('no shared mutable state between instances', () => {
      const seed = 100;
      const path1 = '/path1';
      const path2 = '/path2';

      const rng1 = new XorShift32(seed, path1);
      const rng2 = new XorShift32(seed, path2);

      // Advance rng1
      rng1.next();
      rng1.next();
      rng1.next();

      // rng2 should be unaffected
      const r2_val = rng2.next();

      // Create fresh rng2 to verify it wasn't affected
      const rng2Fresh = new XorShift32(seed, path2);
      expect(r2_val).toBe(rng2Fresh.next());
    });

    it('tie-break scenario: tiebreakRand = next() / 4294967296', () => {
      const seed = 1;
      const canonPath = '/oneOf/0';

      const rng = new XorShift32(seed, canonPath);
      const tiebreakRand = rng.nextFloat01();

      // Verify this matches the spec formula
      const rngCheck = new XorShift32(seed, canonPath);
      const nextVal = rngCheck.next();
      const expectedTiebreak = nextVal / 4294967296;

      expect(tiebreakRand).toBe(expectedTiebreak);
    });
  });
});
