import type { CoverageIndex } from './composition-engine.js';

/**
 * G_valid motif types (v1 baseline and related non-G_valid motifs).
 */
export enum GValidMotif {
  None = 'none',
  SimpleObjectRequired = 'simpleObjectRequired',
  ArrayItemsContainsSimple = 'arrayItemsContainsSimple',
  ApFalseMustCover = 'apFalseMustCover',
  ComplexContains = 'complexContains',
}

/**
 * Per-path G_valid classification result.
 */
export interface GValidInfo {
  /** Canonical path for this classification (e.g. "#/properties/items"). */
  canonPath: string;
  /** Motif detected at this location. */
  motif: GValidMotif;
  /** Whether this location is considered inside the G_valid zone v1. */
  isGValid: boolean;
}

/**
 * Internal map from canonPath to G_valid classification.
 */
export type GValidClassificationIndex = Map<string, GValidInfo>;

/**
 * Placeholder signature for the future classifier.
 *
 * The implementation will be provided by 9401.9401002; this stub lets
 * generator/repair/metrics depend on a stable API without yet performing
 * any real classification.
 */
export function classifyGValidPlaceholder(
  _canonicalSchema: unknown,
  _coverageIndex: CoverageIndex | undefined
): GValidClassificationIndex {
  return new Map();
}

/**
 * Helper to create a non-G_valid entry with no specific motif.
 */
export function makeGValidNone(canonPath: string): GValidInfo {
  return {
    canonPath,
    motif: GValidMotif.None,
    isGValid: false,
  };
}

/**
 * Helper to create a baseline G_valid v1 entry for a given motif.
 */
export function makeGValidMotif(
  canonPath: string,
  motif: GValidMotif.SimpleObjectRequired | GValidMotif.ArrayItemsContainsSimple
): GValidInfo {
  return {
    canonPath,
    motif,
    isGValid: true,
  };
}
