import { describe, expect, it } from 'vitest';

import { decideAnchoredSubsetLifting } from '../anchoredSubset.js';

describe('decideAnchoredSubsetLifting', () => {
  it('lifts literal alternations to strict anchored-safe form', () => {
    const basic = decideAnchoredSubsetLifting('foo|bar');
    expect(basic).toMatchObject({
      canLift: true,
      liftKind: 'strict',
      family: 'alternationOfLiterals',
      liftedSource: '^(?:foo|bar)$',
    });

    const grouped = decideAnchoredSubsetLifting('(?:foo|bar)');
    expect(grouped).toMatchObject({
      canLift: true,
      liftKind: 'strict',
      family: 'alternationOfLiterals',
      liftedSource: '^(?:foo|bar)$',
    });
  });

  it('lifts simple quantified character classes to strict anchors', () => {
    const decision = decideAnchoredSubsetLifting('[A-Za-z0-9_-]+');
    expect(decision).toMatchObject({
      canLift: true,
      liftKind: 'strict',
      family: 'simpleClassQuantified',
      liftedSource: '^[A-Za-z0-9_-]+$',
    });

    const wrapped = decideAnchoredSubsetLifting('(?:[A-Z]{1,16})');
    expect(wrapped).toMatchObject({
      canLift: true,
      liftKind: 'strict',
      family: 'simpleClassQuantified',
      liftedSource: '^[A-Z]{1,16}$',
    });
  });

  it('rejects capturing wrappers around class-only patterns', () => {
    const decision = decideAnchoredSubsetLifting('([A-Z]{1,16})');
    expect(decision).toEqual({ canLift: false, reason: 'notSimpleEnough' });
  });

  it('does not lift patterns that are already anchored', () => {
    const decision = decideAnchoredSubsetLifting('^foo$');
    expect(decision).toEqual({ canLift: false, reason: 'notSimpleEnough' });
  });

  it('fails fast on lookarounds and backreferences', () => {
    const lookahead = decideAnchoredSubsetLifting('(?=x).*');
    expect(lookahead).toEqual({
      canLift: false,
      reason: 'lookaroundOrBackref',
    });

    const backref = decideAnchoredSubsetLifting('a\\1');
    expect(backref).toEqual({ canLift: false, reason: 'lookaroundOrBackref' });
  });

  it('flags patterns that trip the regex complexity cap', () => {
    const longPattern = 'a'.repeat(4100);
    const decision = decideAnchoredSubsetLifting(longPattern);
    expect(decision).toEqual({ canLift: false, reason: 'complexityCap' });
  });

  it('falls back to substring lifting when strict detectors do not apply', () => {
    const decision = decideAnchoredSubsetLifting('foo.*bar');
    expect(decision).toMatchObject({
      canLift: true,
      liftKind: 'substring',
      liftedSource: '^.*(?:foo.*bar).*$',
    });
  });
});
