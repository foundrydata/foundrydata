import { describe, it, expect } from 'vitest';
import { Buffer } from 'node:buffer';
import { stableHash } from '../stable-hash';
import { structuralHash } from '../struct-hash';

describe('stableHash', () => {
  it('returns digest and byte length when below maxBytes threshold', () => {
    const schema = { type: 'string', minLength: 2 };
    const result = stableHash(schema, { maxBytes: 1024 });
    expect(result).not.toBeNull();
    expect(result?.bytes).toBe(Buffer.byteLength(result!.canonical, 'utf8'));

    const structural = structuralHash(schema);
    expect(result?.digest).toBe(structural.digest);
    expect(result?.canonical).toBe(structural.canonical);
  });

  it('returns null when canonical JSON meets or exceeds maxBytes', () => {
    const schema = { type: 'string', minLength: 2 };
    const canonicalLength = Buffer.byteLength(
      stableHash(schema, { maxBytes: Number.MAX_SAFE_INTEGER })!.canonical,
      'utf8'
    );
    const blocked = stableHash(schema, { maxBytes: canonicalLength });
    expect(blocked).toBeNull();

    const below = stableHash(schema, { maxBytes: canonicalLength + 1 });
    expect(below).not.toBeNull();
  });
});
