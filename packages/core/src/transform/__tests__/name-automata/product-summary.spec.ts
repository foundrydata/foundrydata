import { describe, it, expect } from 'vitest';

import { buildThompsonNfa } from '../../name-automata/nfa.js';
import { buildDfaFromNfa } from '../../name-automata/dfa.js';
import { buildProductDfa } from '../../name-automata/product.js';

describe('name automata product summary', () => {
  it('marks explicit empty DFA as empty and finite', () => {
    const emptyDfa = {
      start: 0,
      states: [
        {
          id: 0,
          accepting: false,
          transitions: new Map<number, number>(),
        },
      ],
      accepts: () => false,
    };

    const { summary } = buildProductDfa([emptyDfa]);

    expect(summary.empty).toBe(true);
    expect(summary.finite).toBe(true);
    expect(summary.states).toBe(1);
    expect(summary.capsHit).toBeUndefined();
  });

  it('treats simple anchored-safe languages as finite and non-empty', () => {
    const nfa = buildThompsonNfa('^(?:a|b)$').nfa;
    const dfa = buildDfaFromNfa(nfa).dfa;

    const { summary } = buildProductDfa([dfa]);

    expect(summary.empty).toBe(false);
    expect(summary.finite).toBe(true);
  });

  it('detects cycles as infinite language while remaining non-empty', () => {
    const nfa = buildThompsonNfa('^a+$').nfa;
    const dfa = buildDfaFromNfa(nfa).dfa;

    const { summary } = buildProductDfa([dfa]);

    expect(summary.empty).toBe(false);
    expect(summary.finite).toBe(false);
  });
});
