/* eslint-disable max-depth */
/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */

import type { Nfa, NfaState } from './nfa.js';

export interface DfaState {
  id: number;
  accepting: boolean;
  transitions: Map<number, number>;
}

export interface Dfa {
  start: number;
  states: DfaState[];
  accepts: (input: string) => boolean;
}

export interface DfaBuildOptions {
  /** Maximum DFA states before declaring a cap (default: 4096). */
  maxDfaStates?: number;
}

export interface DfaBuildResult {
  dfa: Dfa;
  stateCount: number;
  capped: boolean;
}

function epsilonClosure(states: NfaState[], start: Set<number>): Set<number> {
  const result = new Set(start);
  const stack = Array.from(start);
  while (stack.length > 0) {
    const id = stack.pop()!;
    const st = states[id];
    if (!st) continue;
    for (const next of st.epsilon) {
      if (!result.has(next)) {
        result.add(next);
        stack.push(next);
      }
    }
  }
  return result;
}

function move(
  states: NfaState[],
  current: Set<number>,
  codeUnit: number
): Set<number> {
  const next = new Set<number>();
  for (const id of current) {
    const st = states[id];
    if (!st) continue;
    for (const tr of st.transitions) {
      if (!tr.range) continue;
      const { from, to } = tr.range;
      if (codeUnit >= from && codeUnit <= to) {
        next.add(tr.to);
      }
    }
  }
  return epsilonClosure(states, next);
}

function stateSetKey(set: Set<number>): string {
  const arr = Array.from(set.values()).sort((a, b) => a - b);
  return arr.join(',');
}

export function buildDfaFromNfa(
  nfa: Nfa,
  options?: DfaBuildOptions
): DfaBuildResult {
  const maxDfaStates = options?.maxDfaStates ?? 4096;
  const dfaStates: DfaState[] = [];
  const seen = new Map<string, number>();
  const startSet = epsilonClosure(nfa.states, new Set([nfa.start]));
  const queue: { key: string; set: Set<number>; id: number }[] = [];
  const isAcceptingSet = (set: Set<number>): boolean => set.has(nfa.accept);

  const createDfaState = (set: Set<number>): number => {
    const key = stateSetKey(set);
    const existing = seen.get(key);
    if (existing !== undefined) return existing;
    const id = dfaStates.length;
    const accepting = isAcceptingSet(set);
    const dfaState: DfaState = {
      id,
      accepting,
      transitions: new Map(),
    };
    dfaStates.push(dfaState);
    seen.set(key, id);
    queue.push({ key, set, id });
    return id;
  };

  let capped = false;
  const startId = createDfaState(startSet);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentId = current.id;
    const set = current.set;
    const state = dfaStates[currentId];
    if (!state) continue;

    // Discover outgoing transitions by scanning all NFA transitions from the set.
    const ranges: { from: number; to: number }[] = [];
    for (const nid of set) {
      const st = nfa.states[nid];
      if (!st) continue;
      for (const tr of st.transitions) {
        if (!tr.range) continue;
        ranges.push(tr.range);
      }
    }

    if (ranges.length === 0) {
      continue;
    }

    // Normalize ranges into non-overlapping segments to ensure deterministic
    // transitions.
    const points: number[] = [];
    for (const r of ranges) {
      points.push(r.from, r.to + 1);
    }
    points.sort((a, b) => a - b);
    const uniquePoints: number[] = [];
    for (const p of points) {
      if (
        uniquePoints.length === 0 ||
        uniquePoints[uniquePoints.length - 1] !== p
      ) {
        uniquePoints.push(p);
      }
    }

    for (let i = 0; i < uniquePoints.length - 1; i += 1) {
      const from = uniquePoints[i]!;
      const to = uniquePoints[i + 1]! - 1;
      if (from > to) continue;

      const targetSet = move(nfa.states, set, from);
      if (targetSet.size === 0) continue;

      const targetId = createDfaState(targetSet);
      state.transitions.set(from, targetId);
      if (dfaStates.length > maxDfaStates) {
        capped = true;
        break;
      }
    }

    if (capped) break;
  }

  const dfa: Dfa = {
    start: startId,
    states: dfaStates,
    accepts(input: string): boolean {
      let currentId = this.start;
      for (let i = 0; i < input.length; i += 1) {
        const code = input.charCodeAt(i);
        const state = this.states[currentId];
        if (!state) return false;

        let nextId: number | undefined;
        for (const [from, target] of state.transitions.entries()) {
          if (code >= from) {
            // Because segments are non-overlapping and sorted, the first match wins.
            nextId = target;
            if (code === from) break;
          }
        }

        if (nextId === undefined) {
          return false;
        }
        currentId = nextId;
      }
      const finalState = this.states[currentId];
      return Boolean(finalState && finalState.accepting);
    },
  };

  return {
    dfa,
    stateCount: dfaStates.length,
    capped,
  };
}
