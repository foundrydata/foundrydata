import type { ErrorObject } from 'ajv';
import type { PtrMapping } from '../../util/ptr-map.js';
import { stableParamsKey } from './stable-params-key.js';

export type AjvErrorObject = ErrorObject<
  string,
  Record<string, unknown>,
  unknown
>;

export interface ErrorSignature {
  keyword: string;
  canonPath: string;
  instancePath: string;
  paramsKey: string;
}

/**
 * Resolve the canonical schema location for an AJV error.
 *
 * When a PtrMapping is available, this function FIRST tries to map the
 * error's schemaPath (original pointer) back to a canonical pointer via
 * the reverse pointer map. This prefers the most specific canonical path
 * (lexicographically smallest) when multiple candidates exist.
 *
 * If no mapping is available or no candidate is found, it falls back
 * deterministically to `e.schemaPath` as required by the spec.
 */
export function canonPathFromError(
  error: AjvErrorObject,
  mapping?: PtrMapping
): string {
  const schemaPath = error.schemaPath ?? '';
  if (mapping && schemaPath) {
    const candidates = mapping.revPtrMap.get(schemaPath);
    if (candidates && candidates.length > 0) {
      // revPtrMap is maintained in sorted order, so take the first entry.
      return candidates[0]!;
    }
  }
  return schemaPath;
}

/**
 * Build the stable error signature components for an AJV error.
 *
 * This function does not compute Score(x); it only constructs the tuple
 * (keyword, canonPath(e), instancePath, stableParamsKey(e.params)) in a
 * structured form to be consumed by higher-level score utilities.
 */
export function buildErrorSignature(
  error: AjvErrorObject,
  mapping?: PtrMapping
): ErrorSignature {
  const keyword = error.keyword ?? '';
  const instancePath = error.instancePath ?? '';
  const canonPath = canonPathFromError(error, mapping);
  const paramsKey = stableParamsKey(error.params ?? {});

  return { keyword, canonPath, instancePath, paramsKey };
}
