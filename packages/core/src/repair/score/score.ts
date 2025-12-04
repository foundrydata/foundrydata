import type { PtrMapping } from '../../util/ptr-map.js';
import type { AjvErrorObject } from './error-signature.js';
import { buildErrorSignature } from './error-signature.js';

/**
 * Compute Score(x) as the number of distinct error signatures
 * defined by the canonical spec:
 *   sig(e) = (keyword, canonPath(e), instancePath, stableParamsKey(e.params))
 */
export function computeScore(
  errors: readonly AjvErrorObject[] | null | undefined,
  mapping?: PtrMapping
): number {
  if (!errors || errors.length === 0) return 0;

  const seen = new Set<string>();

  for (const error of errors) {
    if (!error) continue;
    const sig = buildErrorSignature(error, mapping);
    const key = JSON.stringify([
      sig.keyword,
      sig.canonPath,
      sig.instancePath,
      sig.paramsKey,
    ]);
    seen.add(key);
  }

  return seen.size;
}
