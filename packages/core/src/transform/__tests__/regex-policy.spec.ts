import { describe, it, expect } from 'vitest';

import {
  analyzeRegex,
  computeRegexComplexity,
  type RegexPolicyOptions,
} from '../name-automata/regex.js';
import { DIAGNOSTIC_CODES } from '../../diag/codes.js';

function makeOptions(
  context: RegexPolicyOptions['context'],
  maxComplexity?: number
): RegexPolicyOptions {
  return { context, maxComplexity };
}

describe('name-automata regex policy', () => {
  it('classifies simple anchored pattern as anchored-safe', () => {
    const pattern = '^foo$';
    const result = analyzeRegex(pattern, makeOptions('coverage', 32));

    expect(result.compileError).toBe(false);
    expect(result.anchored).toBe(true);
    expect(result.hasLookaround).toBe(false);
    expect(result.hasBackreference).toBe(false);
    expect(result.capped).toBe(false);
    expect(result.isAnchoredSafe).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('treats non-anchored pattern as not anchored-safe', () => {
    const result = analyzeRegex('foo.*', makeOptions('coverage', 64));

    expect(result.anchored).toBe(false);
    expect(result.isAnchoredSafe).toBe(false);
    expect(result.compileError).toBe(false);
  });

  it('detects lookaround constructs and marks pattern as unsafe', () => {
    const pattern = '^(?=x).+$';
    const result = analyzeRegex(pattern, makeOptions('coverage', 128));

    expect(result.anchored).toBe(true);
    expect(result.hasLookaround).toBe(true);
    expect(result.isAnchoredSafe).toBe(false);
    expect(
      result.diagnostics.some(
        (d) => d.code === DIAGNOSTIC_CODES.REGEX_COMPLEXITY_CAPPED
      )
    ).toBe(false);
  });

  it('detects backreferences and marks pattern as unsafe', () => {
    const pattern = '^(a)(b)\\1$';
    const result = analyzeRegex(pattern, makeOptions('coverage', 128));

    expect(result.anchored).toBe(true);
    expect(result.hasBackreference).toBe(true);
    expect(result.isAnchoredSafe).toBe(false);
  });

  it('computes complexity score as length plus quantified groups', () => {
    const pattern = '^a*b{2,3}?$';
    const { complexityScore, quantifiedGroups } =
      computeRegexComplexity(pattern);

    // pattern has one "*" and one "{2,3}" and one "?" quantifier
    expect(quantifiedGroups).toBe(3);
    expect(complexityScore).toBe(pattern.length + quantifiedGroups);
  });

  it('emits REGEX_COMPLEXITY_CAPPED when score exceeds maxComplexity', () => {
    const pattern = '^[a-z]{1,3}[0-9]+$';
    const { complexityScore } = computeRegexComplexity(pattern);
    const maxComplexity = complexityScore - 1;

    const result = analyzeRegex(
      pattern,
      makeOptions('coverage', maxComplexity)
    );

    expect(result.capped).toBe(true);
    expect(result.isAnchoredSafe).toBe(false);
    expect(
      result.diagnostics.some(
        (d) =>
          d.code === DIAGNOSTIC_CODES.REGEX_COMPLEXITY_CAPPED &&
          d.details.patternSource === pattern &&
          d.details.context === 'coverage'
      )
    ).toBe(true);
  });

  it('emits REGEX_COMPILE_ERROR when pattern cannot be compiled', () => {
    const pattern = '[a-';
    const result = analyzeRegex(pattern, makeOptions('rewrite', 64));

    expect(result.compileError).toBe(true);
    expect(result.isAnchoredSafe).toBe(false);
    expect(
      result.diagnostics.some(
        (d) =>
          d.code === DIAGNOSTIC_CODES.REGEX_COMPILE_ERROR &&
          d.details.patternSource === pattern &&
          d.details.context === 'rewrite'
      )
    ).toBe(true);
  });

  it('does not emit complexity cap when pattern is below threshold', () => {
    const pattern = '^a+$';
    const result = analyzeRegex(pattern, makeOptions('coverage', 1024));

    expect(result.capped).toBe(false);
    expect(
      result.diagnostics.some(
        (d) => d.code === DIAGNOSTIC_CODES.REGEX_COMPLEXITY_CAPPED
      )
    ).toBe(false);
  });
});
