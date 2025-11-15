import { describe, it, expect } from 'vitest';

import {
  buildThompsonNfa,
  type Nfa,
  type NfaState,
} from '../name-automata/nfa.js';
import {
  buildDfaFromNfa,
  type Dfa,
  type DfaBuildResult,
} from '../name-automata/dfa.js';

function epsilonClosure(
  states: NfaState[],
  startSet: Set<number>
): Set<number> {
  const result = new Set(startSet);
  const stack = Array.from(startSet);
  while (stack.length > 0) {
    const id = stack.pop()!;
    const state = states[id];
    if (!state) continue;
    for (const next of state.epsilon) {
      if (!result.has(next)) {
        result.add(next);
        stack.push(next);
      }
    }
  }
  return result;
}

function step(
  states: NfaState[],
  current: Set<number>,
  codeUnit: number
): Set<number> {
  const next = new Set<number>();
  for (const id of current) {
    const state = states[id];
    if (!state) continue;
    for (const tr of state.transitions) {
      if (!tr.range) continue;
      const { from, to } = tr.range;
      if (codeUnit >= from && codeUnit <= to) {
        next.add(tr.to);
      }
    }
  }
  return epsilonClosure(states, next);
}

function nfaAccepts(nfa: Nfa, input: string): boolean {
  let current = epsilonClosure(nfa.states, new Set([nfa.start]));
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    current = step(nfa.states, current, code);
    if (current.size === 0) {
      break;
    }
  }
  return current.has(nfa.accept);
}

function dfaAccepts(dfa: Dfa, input: string): boolean {
  return dfa.accepts(input);
}

describe('Thompson NFA construction + DFA subset', () => {
  it('accepts simple anchored literal pattern', () => {
    const { nfa, stateCount } = buildThompsonNfa('^foo$');

    expect(stateCount).toBeGreaterThanOrEqual(2);
    expect(nfaAccepts(nfa, 'foo')).toBe(true);
    expect(nfaAccepts(nfa, 'bar')).toBe(false);
    expect(nfaAccepts(nfa, 'foobar')).toBe(false);
  });

  it('handles alternation and concatenation', () => {
    const { nfa } = buildThompsonNfa('^(?:foo|bar)baz$');

    expect(nfaAccepts(nfa, 'foobaz')).toBe(true);
    expect(nfaAccepts(nfa, 'barbaz')).toBe(true);
    expect(nfaAccepts(nfa, 'baz')).toBe(false);
  });

  it('supports character classes and ranges', () => {
    const { nfa } = buildThompsonNfa('^[a-c][0-9]$');

    expect(nfaAccepts(nfa, 'a0')).toBe(true);
    expect(nfaAccepts(nfa, 'c9')).toBe(true);
    expect(nfaAccepts(nfa, 'd0')).toBe(false);
    expect(nfaAccepts(nfa, 'a')).toBe(false);
  });

  it('supports ?, *, + quantifiers', () => {
    const q = buildThompsonNfa('^ab?c$').nfa;
    expect(nfaAccepts(q, 'ac')).toBe(true);
    expect(nfaAccepts(q, 'abc')).toBe(true);
    expect(nfaAccepts(q, 'abbc')).toBe(false);

    const star = buildThompsonNfa('^ab*c$').nfa;
    expect(nfaAccepts(star, 'ac')).toBe(true);
    expect(nfaAccepts(star, 'abc')).toBe(true);
    expect(nfaAccepts(star, 'abbbc')).toBe(true);

    const plus = buildThompsonNfa('^ab+c$').nfa;
    expect(nfaAccepts(plus, 'ac')).toBe(false);
    expect(nfaAccepts(plus, 'abc')).toBe(true);
    expect(nfaAccepts(plus, 'abbbc')).toBe(true);
  });

  it('supports bounded quantifiers {m,n}', () => {
    const { nfa } = buildThompsonNfa('^a{2,3}$');

    expect(nfaAccepts(nfa, 'a')).toBe(false);
    expect(nfaAccepts(nfa, 'aa')).toBe(true);
    expect(nfaAccepts(nfa, 'aaa')).toBe(true);
    expect(nfaAccepts(nfa, 'aaaa')).toBe(false);
  });

  it('strips top-level ^ and $ anchors before parsing', () => {
    const { nfa } = buildThompsonNfa('^x$');

    expect(nfaAccepts(nfa, 'x')).toBe(true);
    expect(nfaAccepts(nfa, '^x$')).toBe(false);
  });

  it('reports the number of allocated states for caps', () => {
    const { stateCount, nfa } = buildThompsonNfa('^ab+c$');

    expect(stateCount).toBeGreaterThanOrEqual(4);
    // Basic sanity: all state ids are within [0, stateCount)
    for (const state of nfa.states) {
      expect(state.id).toBeGreaterThanOrEqual(0);
      expect(state.id).toBeLessThan(stateCount);
    }
  });

  it('determinizes NFA to DFA with equivalent language on simple patterns', () => {
    const { nfa } = buildThompsonNfa('^ab+c$');
    const dfaResult: DfaBuildResult = buildDfaFromNfa(nfa);

    expect(dfaResult.capped).toBe(false);

    const accepted = ['abc', 'abbc', 'abbbc', 'abbbbc'];
    const rejected = ['ac', 'ab', 'abb'];

    for (const word of accepted) {
      expect(nfaAccepts(nfa, word)).toBe(true);
      expect(dfaAccepts(dfaResult.dfa, word)).toBe(true);
    }
    for (const word of rejected) {
      expect(nfaAccepts(nfa, word)).toBe(false);
      expect(dfaAccepts(dfaResult.dfa, word)).toBe(false);
    }
  });

  it('honors maxDfaStates cap and marks the result as capped', () => {
    const { nfa } = buildThompsonNfa('^(?:a|b|c|d)+$');
    const cappedResult = buildDfaFromNfa(nfa, { maxDfaStates: 2 });

    expect(cappedResult.capped).toBe(true);
    expect(cappedResult.stateCount).toBeGreaterThanOrEqual(2);
  });
});
