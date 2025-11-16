/* eslint-disable max-lines-per-function */

/* eslint-disable complexity */

/**
 * Breadth-first search enumerator for DFA / product-DFA name automata.
 *
 * The automata produced by the name-automata subsystem share a common
 * structural shape: states with numeric ids, an accepting flag, and a
 * transition map keyed by UTF-16 code units.
 *
 * This module walks such an automaton and produces the k shortest witness
 * words, ordered first by length and then by UTF-16 lexicographic order.
 */

interface AutomatonState {
  id: number;
  accepting: boolean;
  transitions: Map<number, number>;
}

interface AutomatonLike {
  start: number;
  states: AutomatonState[];
}

export interface BfsConfig {
  /**
   * Maximum allowed length (in UTF-16 code units) for any witness.
   * Paths that would exceed this length are not expanded.
   */
  maxLength: number;
  /**
   * Maximum number of candidate edges explored before declaring a cap.
   * This bounds total work even when the language (or search space) is large.
   */
  maxCandidates: number;
}

export interface BfsResult {
  /** Witness words discovered in BFS order (shortest, then UTF-16 lexicographic). */
  words: string[];
  /** Total number of candidate edges explored during the search. */
  tried: number;
  /** True when the candidate budget was exhausted before completion. */
  capped: boolean;
}

function normalizeAutomaton(automaton: {
  start: number;
  states: Array<{
    id: number;
    accepting: boolean;
    transitions: Map<number, number>;
  }>;
}): AutomatonLike {
  return automaton as unknown as AutomatonLike;
}

/**
 * Enumerate up to `limit` witness words accepted by the given automaton using
 * breadth-first search over UTF-16 code units.
 *
 * Ordering:
 * - primary: shortest length (number of UTF-16 code units)
 * - secondary: lexicographic by code unit value
 */
export function bfsEnumerate(
  automaton: {
    start: number;
    states: Array<{
      id: number;
      accepting: boolean;
      transitions: Map<number, number>;
    }>;
  },
  limit: number,
  config: BfsConfig
): BfsResult {
  const maxLength = config.maxLength;
  const maxCandidates = config.maxCandidates;

  if (limit <= 0 || maxLength <= 0 || maxCandidates <= 0) {
    return { words: [], tried: 0, capped: maxCandidates <= 0 };
  }

  const core = normalizeAutomaton(automaton);
  const startState = core.states[core.start];
  if (!startState) {
    return { words: [], tried: 0, capped: false };
  }

  const results: string[] = [];
  const queue: Array<{ stateId: number; word: string }> = [];
  let tried = 0;
  let capped = false;

  queue.push({ stateId: core.start, word: '' });

  while (queue.length > 0) {
    const current = queue.shift()!;
    const state = core.states[current.stateId];
    if (!state) continue;

    // Record witnesses in strict BFS order. Empty-string acceptance is
    // permitted generically even though name automata typically enforce
    // non-empty names via guards.
    if (state.accepting) {
      results.push(current.word);
      if (results.length >= limit) {
        break;
      }
    }

    if (current.word.length >= maxLength) {
      continue;
    }

    if (state.transitions.size === 0) {
      continue;
    }

    // Transitions are keyed by the start of a UTF-16 range. Iterate keys in
    // ascending order so that the induced words are ordered lexicographically
    // by code unit.
    const orderedTransitions = Array.from(state.transitions.entries()).sort(
      (a, b) => a[0] - b[0]
    );

    for (const [codeUnit, targetId] of orderedTransitions) {
      const nextChar = String.fromCharCode(codeUnit);
      const nextWord = current.word + nextChar;

      queue.push({ stateId: targetId, word: nextWord });
      tried += 1;

      if (tried >= maxCandidates) {
        capped = true;
        queue.length = 0;
        break;
      }
    }
  }

  return { words: results, tried, capped };
}
