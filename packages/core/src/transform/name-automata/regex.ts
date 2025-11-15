/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
import { DIAGNOSTIC_CODES } from '../../diag/codes.js';

export type RegexContext = 'coverage' | 'rewrite';

export interface RegexPolicyOptions {
  /**
   * Maximum allowed complexity score for a pattern.
   * Score is computed as pattern.length + quantifiedGroups.
   * Defaults to 512.
   */
  maxComplexity?: number;
  /**
   * Context in which the regex is being analyzed.
   * Must align with diagnostic detail schemas and phase checks.
   */
  context: RegexContext;
}

export interface RegexDiagnostic {
  code:
    | typeof DIAGNOSTIC_CODES.REGEX_COMPLEXITY_CAPPED
    | typeof DIAGNOSTIC_CODES.REGEX_COMPILE_ERROR;
  details: {
    patternSource: string;
    context: RegexContext;
  };
}

export interface RegexAnalysis {
  patternSource: string;
  anchored: boolean;
  hasLookaround: boolean;
  hasBackreference: boolean;
  compileError: boolean;
  capped: boolean;
  /**
   * Complexity score: pattern.length + quantifiedGroups.
   */
  complexityScore: number;
  quantifiedGroups: number;
  /**
   * True when the pattern is suitable for coverage proofs:
   * - compiles
   * - anchored with ^...$
   * - no lookaround or backreferences
   * - not capped by complexity
   */
  isAnchoredSafe: boolean;
  diagnostics: RegexDiagnostic[];
}

const DEFAULT_MAX_COMPLEXITY = 512;

function isEscaped(pattern: string, index: number): boolean {
  if (index <= 0) {
    return false;
  }
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && pattern[i] === '\\'; i -= 1) {
    backslashes += 1;
  }
  return (backslashes & 1) === 1;
}

function hasLookaround(pattern: string): boolean {
  // Conservative heuristic: treat any of these tokens as lookaround.
  // False positives (e.g. inside character classes) are acceptable for safety.
  return (
    pattern.includes('(?=') ||
    pattern.includes('(?!') ||
    pattern.includes('(?<=') ||
    pattern.includes('(?<!')
  );
}

function hasBackreference(pattern: string): boolean {
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch !== '\\' || isEscaped(pattern, i)) {
      continue;
    }
    const next = pattern[i + 1];
    if (next !== undefined) {
      if (next >= '1' && next <= '9') {
        return true;
      }
      if (next >= '0' && next <= '9') {
        // Skip \0 and similar numeric escapes that are not backrefs
        continue;
      }
    }
  }
  return false;
}

export function computeRegexComplexity(pattern: string): {
  complexityScore: number;
  quantifiedGroups: number;
} {
  let quantifiedGroups = 0;
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '*' || ch === '+' || ch === '?') {
      if (!isEscaped(pattern, i)) {
        quantifiedGroups += 1;
      }
      continue;
    }
    if (ch === '{' && !isEscaped(pattern, i)) {
      const close = pattern.indexOf('}', i + 1);
      if (close === -1) {
        continue;
      }
      const body = pattern.slice(i + 1, close);
      if (/^\d+(,\d*)?$/.test(body)) {
        quantifiedGroups += 1;
        i = close;
      }
    }
  }
  const complexityScore = pattern.length + quantifiedGroups;
  return { complexityScore, quantifiedGroups };
}

export function analyzeRegex(
  patternSource: string,
  options: RegexPolicyOptions
): RegexAnalysis {
  const context = options.context;
  const maxComplexity = options.maxComplexity ?? DEFAULT_MAX_COMPLEXITY;
  const diagnostics: RegexDiagnostic[] = [];

  let compileError = false;
  try {
    // Compile to ensure the pattern is syntactically valid in the target engine.
    // Flags are omitted here; callers control flags via AJV configuration.
    new RegExp(patternSource);
  } catch {
    compileError = true;
    diagnostics.push({
      code: DIAGNOSTIC_CODES.REGEX_COMPILE_ERROR,
      details: {
        patternSource,
        context,
      },
    });
  }

  const anchored =
    patternSource.length >= 2 &&
    patternSource[0] === '^' &&
    !isEscaped(patternSource, 0) &&
    patternSource[patternSource.length - 1] === '$' &&
    !isEscaped(patternSource, patternSource.length - 1);

  const lookaround = hasLookaround(patternSource);
  const backreference = hasBackreference(patternSource);

  const { complexityScore, quantifiedGroups } =
    computeRegexComplexity(patternSource);

  const capped = complexityScore > maxComplexity;
  if (!compileError && capped) {
    diagnostics.push({
      code: DIAGNOSTIC_CODES.REGEX_COMPLEXITY_CAPPED,
      details: {
        patternSource,
        context,
      },
    });
  }

  const isAnchoredSafe =
    !compileError && anchored && !lookaround && !backreference && !capped;

  return {
    patternSource,
    anchored,
    hasLookaround: lookaround,
    hasBackreference: backreference,
    compileError,
    capped,
    complexityScore,
    quantifiedGroups,
    isAnchoredSafe,
    diagnostics,
  };
}
