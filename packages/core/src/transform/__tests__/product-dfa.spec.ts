import { describe, it, expect } from 'vitest';

import { buildThompsonNfa } from '../name-automata/nfa.js';
import { buildDfaFromNfa } from '../name-automata/dfa.js';
import { buildProductDfa } from '../name-automata/product.js';

describe('Product DFA for AP:false conjuncts', () => {
  it('accepts exactly the intersection of two DFAs', () => {
    const nfa1 = buildThompsonNfa('^a[0-9]$').nfa;
    const dfa1Result = buildDfaFromNfa(nfa1);
    const dfa1 = dfa1Result.dfa;

    const nfa2 = buildThompsonNfa('^[a-z][0-9]$').nfa;
    const dfa2Result = buildDfaFromNfa(nfa2);
    const dfa2 = dfa2Result.dfa;

    const product = buildProductDfa([dfa1, dfa2]).dfa;

    const words = ['a0', 'a9', 'b0', 'aa', 'a'];
    for (const word of words) {
      const lhs = product.accepts(word);
      const rhs = dfa1.accepts(word) && dfa2.accepts(word);
      expect(lhs).toBe(rhs);
    }
  });

  it('handles three-way intersection', () => {
    const nfa1 = buildThompsonNfa('^[a-c][0-9]$').nfa;
    const nfa2 = buildThompsonNfa('^.[1-3]$').nfa;
    const nfa3 = buildThompsonNfa('^a[0-9]$').nfa;

    const dfa1 = buildDfaFromNfa(nfa1).dfa;
    const dfa2 = buildDfaFromNfa(nfa2).dfa;
    const dfa3 = buildDfaFromNfa(nfa3).dfa;

    const product = buildProductDfa([dfa1, dfa2, dfa3]).dfa;

    const words = ['a1', 'a3', 'b1', 'a0', 'a4'];
    for (const word of words) {
      const lhs = product.accepts(word);
      const rhs =
        dfa1.accepts(word) && dfa2.accepts(word) && dfa3.accepts(word);
      expect(lhs).toBe(rhs);
    }
  });

  it('honors maxProductStates cap and marks the result as capped', () => {
    const nfa1 = buildThompsonNfa('^[ab][0-9]$').nfa;
    const nfa2 = buildThompsonNfa('^[a-z][0-9]$').nfa;

    const dfa1 = buildDfaFromNfa(nfa1).dfa;
    const dfa2 = buildDfaFromNfa(nfa2).dfa;

    const cappedResult = buildProductDfa([dfa1, dfa2], {
      maxProductStates: 1,
    });

    expect(cappedResult.capped).toBe(true);
    expect(cappedResult.stateCount).toBeGreaterThanOrEqual(1);
  });
});
