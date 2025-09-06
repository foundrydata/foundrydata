/**
 * Limitations Registry
 * Centralized reference for MVP limitations, workarounds, and availability.
 */

import { ErrorCode } from './codes';
import type { FoundryError, ErrorContext } from '../types/errors';

export const CURRENT_VERSION = '0.1.0';

export interface Limitation {
  key: string;
  title: string;
  errorCode: ErrorCode;
  availableIn: string; // semver-like string, e.g. '0.3.0'
  workaround: string;
  workaroundExample: string;
  docsAnchor: string; // anchor id in MVP_LIMITATIONS.md
  featureExamples: string[];
}

export type LimitationKey =
  | 'nestedObjects'
  | 'regexPatterns'
  | 'schemaComposition';

const DOCS_BASE_URL =
  'https://github.com/foundrydata/foundrydata/blob/main/docs/MVP_LIMITATIONS.md';

export const LIMITATIONS_REGISTRY: Record<LimitationKey, Limitation> = {
  nestedObjects: {
    key: 'nestedObjects',
    title: 'Nested Objects Not Supported',
    errorCode: ErrorCode.NESTED_OBJECTS_NOT_SUPPORTED,
    availableIn: '0.3.0',
    workaround:
      'Flatten nested objects into top-level properties or reference separate objects.',
    workaroundExample:
      "Replace nested 'address' object with top-level 'address_*' fields.",
    docsAnchor: 'nested-objects',
    featureExamples: [
      "{ type: 'object', properties: { address: { type: 'object' } } }",
    ],
  },
  regexPatterns: {
    key: 'regexPatterns',
    title: 'Regex Patterns Not Supported',
    errorCode: ErrorCode.REGEX_PATTERNS_NOT_SUPPORTED,
    availableIn: '0.2.0',
    workaround:
      'Use enum or supported format constraints instead of custom regex patterns.',
    workaroundExample:
      "Use { format: 'email' } or an explicit enum instead of a 'pattern'.",
    docsAnchor: 'keywords-not-supported',
    featureExamples: ["{ type: 'string', pattern: '^[A-Z]{3}$' }"],
  },
  schemaComposition: {
    key: 'schemaComposition',
    title: 'Schema Composition Not Supported',
    errorCode: ErrorCode.SCHEMA_COMPOSITION_NOT_SUPPORTED,
    availableIn: '1.0.0',
    workaround:
      'Manually merge constraints from allOf/anyOf/oneOf into a single schema.',
    workaroundExample:
      'Inline the combined constraints and remove composition keywords.',
    docsAnchor: 'keywords-not-supported',
    featureExamples: [
      "{ allOf: [{ type: 'string' }, { minLength: 3 }] }",
      "{ anyOf: [{ type: 'string' }, { type: 'number' }] }",
    ],
  },
};

export function getLimitation(key: string): Limitation | null {
  return (LIMITATIONS_REGISTRY as Record<string, Limitation>)[key] ?? null;
}

export function compareVersions(a: string, b: string): number {
  const norm = (v: string): number[] =>
    v
      .replace(/^v/i, '')
      .split('.')
      .map((x) => Number.parseInt(x, 10) || 0);
  const [a1 = 0, a2 = 0, a3 = 0] = norm(a);
  const [b1 = 0, b2 = 0, b3 = 0] = norm(b);
  if (a1 !== b1) return a1 - b1;
  if (a2 !== b2) return a2 - b2;
  return a3 - b3;
}

export function isSupported(key: string, version: string): boolean {
  const lim = getLimitation(key);
  if (!lim) return false;
  return compareVersions(version, lim.availableIn) >= 0;
}

export function enrichErrorWithLimitation(
  error: FoundryError,
  key: string
): FoundryError {
  const lim = getLimitation(key);
  if (!lim) return error;

  // Attach top-level enrichment for presenter consumption
  error.limitationKey = lim.key;
  error.availableIn = lim.availableIn;
  const docUrl = `${DOCS_BASE_URL}#${lim.docsAnchor}`;
  error.documentation = error.documentation ?? docUrl;

  // Add workaround as first suggestion if none present
  if (!Array.isArray(error.suggestions) || error.suggestions.length === 0) {
    error.suggestions = [lim.workaround];
  }

  // Also enrich error context for serializers
  const ctx: ErrorContext = { ...(error.context ?? {}) };
  ctx.limitationKey = lim.key;
  ctx.availableIn = lim.availableIn;
  // Mutate context in a typed-safe way (runtime allows it)
  (error as unknown as { context?: ErrorContext }).context = ctx;

  return error;
}

export default LIMITATIONS_REGISTRY;
