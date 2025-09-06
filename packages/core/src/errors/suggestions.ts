/**
 * Suggestion System (MVP)
 * Pure helper functions to generate suggestions and workarounds.
 * No classes, no state, easy to test.
 */

import type { SchemaError } from '../types/errors';
import {
  LIMITATIONS_REGISTRY,
  type LimitationKey,
  type Limitation,
} from './limitations';

// Public helper types
export interface Alternative {
  workaround: string;
  example?: string;
  documentation?: string;
}

export interface SchemaFix {
  path?: string;
  explanation: string;
  example?: string;
}

export interface Workaround {
  description: string;
  example?: string;
  availableIn?: string;
}

/**
 * Simple edit-distance-like function (MVP). Not full Levenshtein: we
 * approximate distance by counting positional char differences plus the
 * absolute length delta. Good enough for small typos.
 */
export function calculateDistance(a: string, b: string): number {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return shorter.length;
  if (shorter.length === 0) return longer.length;

  let distance = Math.abs(a.length - b.length);
  for (let i = 0; i < shorter.length; i++) {
    if (shorter[i] !== longer[i]) distance++;
  }
  return distance;
}

/**
 * Return up to 3 close matches for a misspelt string.
 */
export function didYouMean(
  input: string,
  validOptions: string[],
  maxDistance = 3
): string[] {
  const normalized = input ?? '';
  return validOptions
    .map((option) => ({
      option,
      distance: calculateDistance(normalized, option),
    }))
    .filter(({ distance }) => distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map(({ option }) => option);
}

/**
 * Get a high-level alternative/workaround for an unsupported feature.
 * Keys map to the central LIMITATIONS_REGISTRY.
 */
export function getAlternative(unsupportedFeature: string): Alternative | null {
  const lim = (LIMITATIONS_REGISTRY as Record<string, Limitation>)[
    unsupportedFeature
  ];
  if (!lim) return null;
  return {
    workaround: lim.workaround,
    example: lim.workaroundExample,
    documentation: `https://github.com/foundrydata/foundrydata/blob/main/docs/MVP_LIMITATIONS.md#${lim.docsAnchor}`,
  };
}

/**
 * Propose a schema fix using the limitation's workaround text.
 */
export function proposeSchemaFix(error: SchemaError): SchemaFix | null {
  const ctx = error.context as {
    path?: string;
    limitationKey?: LimitationKey | string;
  };
  const key = ctx?.limitationKey;
  if (!key) return null;
  const lim = (LIMITATIONS_REGISTRY as Record<string, Limitation>)[key];
  if (!lim) return null;
  return {
    path: ctx?.path,
    explanation: lim.workaround,
    example: lim.workaroundExample,
  };
}

/**
 * Retrieve a workaround bundle for a limitation key.
 */
export function getWorkaround(limitationKey: string): Workaround | null {
  const lim = (LIMITATIONS_REGISTRY as Record<string, Limitation>)[
    limitationKey
  ];
  if (!lim) return null;
  return {
    description: lim.workaround,
    example: lim.workaroundExample,
    availableIn: lim.availableIn,
  };
}

export default {
  didYouMean,
  getAlternative,
  proposeSchemaFix,
  getWorkaround,
  calculateDistance,
};
