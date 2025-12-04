import { canonicalizeForHash } from '../../util/canonical-json.js';

/**
 * Compute a stable canonical JSON string for AJV `e.params`.
 *
 * This delegates to the same canonicalization used for structural hashing:
 * - objects: keys sorted lexicographically
 * - arrays: items kept in order
 * - numbers: `-0` normalized to `0`
 * - BigInt and other non-JSON primitives handled via jsonSafeReplacer
 *
 * The result is a pure string that can be used as the params component of
 * the error signature defined in the canonical spec.
 */
export function stableParamsKey(params: unknown): string {
  const { text } = canonicalizeForHash(params);
  return text;
}
