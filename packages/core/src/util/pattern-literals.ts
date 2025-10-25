/* eslint-disable max-depth */
/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
/*
 * Utilities shared between Compose and Repair for detecting anchored literal
 * pattern forms such as ^(?:foo|bar)$.
 */

export function extractExactLiteralAlternatives(
  source: string
): string[] | undefined {
  if (!source.startsWith('^') || !source.endsWith('$')) {
    return undefined;
  }

  const body = source.slice(1, -1);
  if (body.startsWith('(?:') && body.endsWith(')')) {
    const inner = body.slice(3, -1);
    const parts = splitAlternatives(inner);
    if (!parts) return undefined;
    const literals: string[] = [];
    for (const part of parts) {
      const literal = decodeLiteral(part);
      if (literal === undefined) return undefined;
      literals.push(literal);
    }
    return literals;
  }

  const literal = decodeLiteral(body);
  return literal === undefined ? undefined : [literal];
}

function splitAlternatives(pattern: string): string[] | undefined {
  const parts: string[] = [];
  let current = '';
  let escaping = false;

  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern.charAt(i);
    if (escaping) {
      current += `\\${ch}`;
      escaping = false;
      continue;
    }

    if (ch === '\\') {
      escaping = true;
      continue;
    }

    if (ch === '|') {
      parts.push(current);
      current = '';
      continue;
    }

    if ('()[]{}'.includes(ch)) {
      return undefined;
    }

    current += ch;
  }

  if (escaping) return undefined;
  parts.push(current);
  return parts;
}

function decodeLiteral(pattern: string): string | undefined {
  let result = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern.charAt(i);
    if (ch === '\\') {
      i += 1;
      if (i >= pattern.length) return undefined;
      result += pattern.charAt(i);
      continue;
    }
    if ('.*+?()[]{}|^$'.includes(ch)) {
      return undefined;
    }
    result += ch;
  }
  return result;
}

export interface RegexScanResult {
  anchoredStart: boolean;
  anchoredEnd: boolean;
  hasLookAround: boolean;
  hasBackReference: boolean;
  complexityCapped: boolean;
}

export function scanRegexSource(source: string): RegexScanResult {
  if (source.length > 4096) {
    return {
      anchoredStart: source.startsWith('^'),
      anchoredEnd: source.endsWith('$'),
      hasLookAround: false,
      hasBackReference: false,
      complexityCapped: true,
    };
  }

  let anchoredStart = false;
  let anchoredEnd = false;
  let hasLookAround = false;
  let hasBackReference = false;
  let complexityCapped = false;

  const stack: number[] = [];
  let inClass = false;
  let escapeCount = 0;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]!;
    const unescaped = escapeCount % 2 === 0;

    if (unescaped && !inClass && ch === '^' && i === 0) {
      anchoredStart = true;
    }
    if (unescaped && !inClass && ch === '$' && i === source.length - 1) {
      anchoredEnd = true;
    }

    if (unescaped && !inClass && ch === '[') {
      inClass = true;
    } else if (unescaped && inClass && ch === ']') {
      inClass = false;
    }

    if (unescaped && !inClass && ch === '(') {
      if (source[i + 1] === '?') {
        const lookAhead2 = source.slice(i + 1, i + 3);
        const lookAhead4 = source.slice(i + 1, i + 5);
        if (
          lookAhead2 === '?=' ||
          lookAhead2 === '?!' ||
          lookAhead4 === '?<=' ||
          lookAhead4 === '?<!'
        ) {
          hasLookAround = true;
        }
      }
      stack.push(i);
    } else if (unescaped && !inClass && ch === ')') {
      if (stack.length > 0) {
        stack.pop();
        if (!complexityCapped) {
          const k = i + 1;
          if (k < source.length) {
            const next = source.charAt(k);
            if (next === '*' || next === '+' || next === '?') {
              complexityCapped = true;
            } else if (next === '{') {
              let j = k + 1;
              while (j < source.length) {
                const digitChar = source.charAt(j);
                if (!/[0-9,]/.test(digitChar)) {
                  break;
                }
                j += 1;
              }
              if (j > k + 1 && j < source.length && source.charAt(j) === '}') {
                complexityCapped = true;
              }
            }
          }
        }
      }
    }

    if (unescaped && !inClass && ch === '\\') {
      const next = source[i + 1];
      if (next !== undefined) {
        if (/[1-9]/.test(next)) {
          hasBackReference = true;
        } else if (next === 'k' && source[i + 2] === '<') {
          hasBackReference = true;
        }
      }
    }

    if (ch === '\\') {
      escapeCount += 1;
    } else {
      escapeCount = 0;
    }
  }

  return {
    anchoredStart,
    anchoredEnd,
    hasLookAround,
    hasBackReference,
    complexityCapped,
  };
}

export function isRegexComplexityCapped(source: string): boolean {
  return scanRegexSource(source).complexityCapped;
}
