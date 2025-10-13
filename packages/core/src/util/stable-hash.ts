import { createHash } from 'node:crypto';
import { canonicalizeForHash } from './canonical-json';

export interface StableHashOptions {
  maxBytes?: number;
}

export interface StableHashResult {
  digest: string;
  bytes: number;
  canonical: string;
}

export function stableHash(
  value: unknown,
  options: StableHashOptions = {}
): StableHashResult | null {
  const canonical = canonicalizeForHash(value);
  if (
    typeof options.maxBytes === 'number' &&
    canonical.byteLength >= options.maxBytes
  ) {
    return null;
  }
  const digest = createHash('sha256').update(canonical.buffer).digest('hex');
  return { digest, bytes: canonical.byteLength, canonical: canonical.text };
}
