/* eslint-disable max-depth */
/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
import { computeRegexComplexity } from '../transform/name-automata/regex.js';
import { scanRegexSource } from '../util/pattern-literals.js';

export type LiftKind = 'strict' | 'substring';
export type StrictFamily = 'alternationOfLiterals' | 'simpleClassQuantified';

export type LiftDecision =
  | {
      canLift: true;
      liftKind: 'strict';
      family: StrictFamily;
      liftedSource: string;
    }
  | { canLift: true; liftKind: 'substring'; liftedSource: string }
  | {
      canLift: false;
      reason:
        | 'lookaroundOrBackref'
        | 'compileError'
        | 'complexityCap'
        | 'notSimpleEnough';
    };

const MAX_COMPLEXITY_SCORE = 512;

export function decideAnchoredSubsetLifting(
  jsonUnescapedSource: string
): LiftDecision {
  const scan = scanRegexSource(jsonUnescapedSource);
  if (scan.hasLookAround || scan.hasBackReference) {
    return { canLift: false, reason: 'lookaroundOrBackref' };
  }

  const complexityScore =
    computeRegexComplexity(jsonUnescapedSource).complexityScore;
  const capped =
    scan.complexityCapped || complexityScore > MAX_COMPLEXITY_SCORE;

  if (capped) {
    return { canLift: false, reason: 'complexityCap' };
  }

  let compiled: RegExp | undefined;
  try {
    compiled = new RegExp(jsonUnescapedSource, 'u');
  } catch {
    return { canLift: false, reason: 'compileError' };
  }
  const anchored = scan.anchoredStart && scan.anchoredEnd;
  if (!compiled || anchored) {
    return { canLift: false, reason: 'notSimpleEnough' };
  }

  const trimmed = stripAnchors(jsonUnescapedSource);

  const topLevelCapturing = isCapturingGroupWrapper(trimmed);
  const altCandidate = unwrapTopLevelGroup(trimmed, true) ?? trimmed;
  const literalAlt = detectLiteralAlternation(altCandidate);
  if (literalAlt) {
    const escaped = literalAlt.map(escapeLiteralForRegex);
    const liftedSource = `^(?:${escaped.join('|')})$`;
    return {
      canLift: true,
      liftKind: 'strict',
      family: 'alternationOfLiterals',
      liftedSource,
    };
  }

  const classCandidate = unwrapTopLevelGroup(trimmed, false) ?? trimmed;
  if (isSimpleClassQuantified(classCandidate)) {
    const liftedSource = `^${classCandidate}$`;
    return {
      canLift: true,
      liftKind: 'strict',
      family: 'simpleClassQuantified',
      liftedSource,
    };
  }

  if (topLevelCapturing) {
    return { canLift: false, reason: 'notSimpleEnough' };
  }

  return {
    canLift: true,
    liftKind: 'substring',
    liftedSource: `^.*(?:${jsonUnescapedSource}).*$`,
  };
}

function stripAnchors(source: string): string {
  let start = 0;
  let end = source.length;
  if (source.startsWith('^')) {
    start = 1;
  }
  if (end - start > 0 && source.endsWith('$') && !isEscaped(source, end - 1)) {
    end -= 1;
  }
  return source.slice(start, end);
}

function isEscaped(source: string, index: number): boolean {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && source[i] === '\\'; i -= 1) {
    backslashes += 1;
  }
  return (backslashes & 1) === 1;
}

function unwrapTopLevelGroup(
  source: string,
  allowCapturing: boolean
): string | undefined {
  if (!source.startsWith('(') || !source.endsWith(')')) return undefined;
  let depth = 0;
  let inClass = false;
  let escaped = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (!inClass && ch === '(') {
      depth += 1;
      if (depth === 1) {
        const marker = source.slice(i + 1, i + 3);
        if (marker.startsWith('?') && marker !== '?:') {
          return undefined;
        }
        if (!allowCapturing && marker !== '?:') {
          return undefined;
        }
      }
    } else if (!inClass && ch === ')') {
      depth -= 1;
      if (depth === 0 && i !== source.length - 1) {
        return undefined;
      }
      if (depth < 0) {
        return undefined;
      }
    } else if (ch === '[' && !inClass) {
      inClass = true;
    } else if (ch === ']' && inClass) {
      inClass = false;
    }
  }
  if (depth !== 0) return undefined;
  const inner = source.slice(
    source.startsWith('(?:') ? 3 : allowCapturing ? 1 : 3,
    source.length - 1
  );
  return inner;
}

function isCapturingGroupWrapper(source: string): boolean {
  if (!source.startsWith('(') || source.startsWith('(?:')) return false;
  if (!source.endsWith(')')) return false;
  let depth = 0;
  let escaped = false;
  let inClass = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '[' && !inClass) {
      inClass = true;
      continue;
    }
    if (ch === ']' && inClass) {
      inClass = false;
      continue;
    }
    if (inClass) continue;
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (depth === 0 && i < source.length - 1) return false;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function detectLiteralAlternation(source: string): string[] | undefined {
  const parts: string[] = [];
  let current = '';
  let escaped = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]!;
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '|') {
      parts.push(current);
      current = '';
      continue;
    }
    if ('[](){}'.includes(ch)) {
      return undefined;
    }
    if ('.*+?^$'.includes(ch)) {
      return undefined;
    }
    current += ch;
  }
  if (escaped) return undefined;
  parts.push(current);
  if (parts.some((p) => p.length === 0)) return undefined;
  return parts;
}

function isSimpleClassQuantified(source: string): boolean {
  if (!source) return false;
  let index = 0;
  let seenUnit = false;

  while (index < source.length) {
    const unit = readUnit(source, index);
    if (!unit) return false;
    seenUnit = true;
    index = unit.next;
    const quant = readQuantifier(source, index);
    if (quant) {
      if (!isQuantifierAllowed(quant)) return false;
      index = quant.next;
    }
  }

  return seenUnit;
}

function readUnit(source: string, index: number): { next: number } | undefined {
  const ch = source[index];
  if (!ch) return undefined;
  if (ch === '[') {
    const end = findCharClassEnd(source, index);
    if (end === -1) return undefined;
    return { next: end + 1 };
  }
  if (ch === '(' && source[index + 1] === '?' && source[index + 2] === ':') {
    const end = findMatchingParen(source, index);
    if (end === -1) return undefined;
    const inner = source.slice(index + 3, end);
    if (!isSimpleClassQuantified(inner)) return undefined;
    return { next: end + 1 };
  }
  return undefined;
}

function findCharClassEnd(source: string, start: number): number {
  let escaped = false;
  for (let i = start + 1; i < source.length; i += 1) {
    const ch = source[i]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '[') {
      return -1;
    }
    if (ch === ']') {
      return i;
    }
  }
  return -1;
}

function findMatchingParen(source: string, start: number): number {
  let escaped = false;
  let inClass = false;
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '[' && !inClass) {
      inClass = true;
      continue;
    }
    if (ch === ']' && inClass) {
      inClass = false;
      continue;
    }
    if (inClass) continue;
    if (ch === '(') {
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
      if (depth < 0) return -1;
    }
  }
  return -1;
}

interface QuantifierSpec {
  min: number;
  max?: number;
  next: number;
}

function readQuantifier(
  source: string,
  index: number
): QuantifierSpec | undefined {
  const ch = source[index];
  if (!ch) return undefined;
  if (ch === '?' || ch === '*' || ch === '+') {
    return { min: ch === '+' ? 1 : 0, next: skipNonGreedy(source, index + 1) };
  }
  if (ch !== '{') return undefined;

  let cursor = index + 1;
  let body = '';
  while (cursor < source.length && source[cursor] !== '}') {
    body += source[cursor];
    cursor += 1;
  }
  if (cursor >= source.length || source[cursor] !== '}') return undefined;
  const next = skipNonGreedy(source, cursor + 1);
  if (!/^\d+(,\d*)?$/.test(body)) return undefined;
  const parts = body.split(',');
  const min = Number.parseInt(parts[0] ?? '', 10);
  if (!Number.isFinite(min) || min < 0) return undefined;
  const max =
    parts.length === 1 || parts[1] === ''
      ? undefined
      : Number.parseInt(parts[1] ?? '', 10);
  if (max !== undefined && (Number.isNaN(max) || max < min)) return undefined;
  return { min, max, next };
}

function skipNonGreedy(source: string, index: number): number {
  if (source[index] === '?') {
    return index + 1;
  }
  return index;
}

function isQuantifierAllowed(quant: QuantifierSpec): boolean {
  if (quant.max !== undefined) {
    return quant.min <= quant.max && quant.max <= 64;
  }
  return quant.min <= 64;
}

function escapeLiteralForRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
