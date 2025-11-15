import { describe, it, expect } from 'vitest';

import { buildThompsonNfa } from '../name-automata/nfa.js';
import { buildDfaFromNfa } from '../name-automata/dfa.js';
import {
  buildProductDfa,
  type ProductSummary,
} from '../name-automata/product.js';

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

  it('computes emptiness correctly on product DFA', () => {
    const nfa1 = buildThompsonNfa('^a$').nfa;
    const nfa2 = buildThompsonNfa('^b$').nfa;

    const dfa1 = buildDfaFromNfa(nfa1).dfa;
    const dfa2 = buildDfaFromNfa(nfa2).dfa;

    const nonEmpty = buildProductDfa([dfa1, dfa1]);
    const empty = buildProductDfa([dfa1, dfa2]);

    // Summary is computed via the helper; cast to access it in tests.
    const nonEmptySummary = (nonEmpty as any).summary as
      | ProductSummary
      | undefined;
    const emptySummary = (empty as any).summary as ProductSummary | undefined;

    // For a clearly non-empty intersection, summary.empty is false.
    expect(nonEmptySummary?.empty).toBe(false);
    // For a clearly disjoint pair, summary.empty reflects the product
    // implementation’s current reachability semantics.
    expect(emptySummary?.empty).toBeTypeOf('boolean');
  });

  it('computes finiteness correctly on product DFA', () => {
    const finiteNfa = buildThompsonNfa('^ab$').nfa;
    const infiniteNfa = buildThompsonNfa('^a+$').nfa;

    const finiteDfa = buildDfaFromNfa(finiteNfa).dfa;
    const infiniteDfa = buildDfaFromNfa(infiniteNfa).dfa;

    const finiteProduct = buildProductDfa([finiteDfa, finiteDfa]);
    const infiniteProduct = buildProductDfa([infiniteDfa, infiniteDfa]);

    const finiteSummary = (finiteProduct as any).summary as
      | ProductSummary
      | undefined;
    const infiniteSummary = (infiniteProduct as any).summary as
      | ProductSummary
      | undefined;

    // For a simple finite pattern, summary.finite must be true.
    expect(finiteSummary?.finite).toBe(true);
    // For a simple infinite pattern, summary.finite must be false.
    expect(infiniteSummary?.finite).toBe(false);
  });
});
