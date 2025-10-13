import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { canonicalizeForHash } from './canonical-json';

export interface StructuralHashResult {
  digest: string;
  canonical: string;
}

export function structuralHash(value: unknown): StructuralHashResult {
  const canonical = canonicalizeForHash(value);
  const digest = createHash('sha256').update(canonical.buffer).digest('hex');
  return { digest, canonical: canonical.text };
}

export function bucketsEqual(
  bucket: readonly unknown[],
  candidate: unknown
): boolean {
  return bucket.some((existing) => isDeepStrictEqual(existing, candidate));
}
