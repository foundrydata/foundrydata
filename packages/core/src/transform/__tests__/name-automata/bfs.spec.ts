import { describe, it, expect } from 'vitest';

import { buildThompsonNfa } from '../../name-automata/nfa.js';
import { buildDfaFromNfa } from '../../name-automata/dfa.js';
import { buildProductDfa } from '../../name-automata/product.js';
import { bfsEnumerate } from '../../name-automata/bfs.js';

const DEFAULT_CONFIG = {
  maxLength: 8,
  maxCandidates: 10_000,
};

describe('name automata BFS witnesses', () => {
  it('enumerates witnesses ordered by length then UTF-16', () => {
    // Pattern accepts "ab" and "aba" – two- and three-letter words.
    const nfa = buildThompsonNfa('^(?:ab|aba)$').nfa;
    const dfa = buildDfaFromNfa(nfa).dfa;

    const { words, capped } = bfsEnumerate(dfa, 2, DEFAULT_CONFIG);

    expect(capped).toBe(false);
    expect(words).toEqual(['ab', 'aba']);
  });

  it('produces min-lex witnesses for simple patternProperties-style language', () => {
    // This mirrors the acceptance test from the spec:
    // patternProperties: { "^(?:x|y)[a-z]$": {} }, minProperties: 2
    const nfa = buildThompsonNfa('^(?:x|y)[a-z]$').nfa;
    const dfa = buildDfaFromNfa(nfa).dfa;

    const { words } = bfsEnumerate(dfa, 2, DEFAULT_CONFIG);

    // Shortest length (2) and UTF-16 order on the leading symbol ⇒ "xa", then "ya".
    expect(words).toEqual(['xa', 'ya']);
  });

  it('works over product DFAs by intersecting languages', () => {
    // Product DFA is constructed from two component DFAs; BFS must still
    // respect length-then-lexicographic ordering for whatever language the
    // product accepts.
    const nfa1 = buildThompsonNfa('^a[bc]$').nfa;
    const nfa2 = buildThompsonNfa('^[ab]b$').nfa;

    const dfa1 = buildDfaFromNfa(nfa1).dfa;
    const dfa2 = buildDfaFromNfa(nfa2).dfa;

    const product = buildProductDfa([dfa1, dfa2]).dfa;

    const { words, capped } = bfsEnumerate(product, 3, DEFAULT_CONFIG);

    expect(capped).toBe(false);
    expect(words.length).toBeGreaterThan(0);
    // All witnesses must be accepted by the product automaton.
    for (const w of words) {
      expect(product.accepts(w)).toBe(true);
    }
    // And they must already be ordered by (length, UTF-16 lexicographic).
    const sorted = words
      .slice()
      .sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
    expect(words).toEqual(sorted);
  });

  it('respects candidate budget on infinite languages', () => {
    const nfa = buildThompsonNfa('^[ab]+$').nfa;
    const dfa = buildDfaFromNfa(nfa).dfa;

    const { words, tried, capped } = bfsEnumerate(dfa, 10, {
      maxLength: 8,
      maxCandidates: 5,
    });

    expect(capped).toBe(true);
    expect(tried).toBeGreaterThan(0);
    expect(words.length).toBeGreaterThan(0);
  });
});
