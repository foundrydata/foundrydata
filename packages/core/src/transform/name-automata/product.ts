/* eslint-disable max-depth */
/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */

import type { Dfa } from './dfa.js';

export interface ProductDfaState {
  id: number;
  tuple: number[];
  accepting: boolean;
  transitions: Map<number, number>;
}

export interface ProductDfa {
  start: number;
  states: ProductDfaState[];
  accepts: (input: string) => boolean;
}

export interface ProductBuildOptions {
  /** Maximum number of product states before declaring a cap (default: 4096). */
  maxProductStates?: number;
}

export interface ProductBuildResult {
  dfa: ProductDfa;
  stateCount: number;
  capped: boolean;
  summary: ProductSummary;
}

export interface ProductSummary {
  states: number;
  finite: boolean;
  capsHit?: boolean;
  empty: boolean;
}

function computeProductSummary(
  dfa: ProductDfa,
  capped: boolean
): ProductSummary {
  const totalStates = dfa.states.length;
  if (totalStates === 0) {
    return {
      states: 0,
      finite: true,
      capsHit: capped || undefined,
      empty: true,
    };
  }

  const reachable = new Set<number>();
  const stack: number[] = [dfa.start];
  reachable.add(dfa.start);
  while (stack.length > 0) {
    const id = stack.pop()!;
    const st = dfa.states[id];
    if (!st) continue;
    for (const target of st.transitions.values()) {
      if (!reachable.has(target)) {
        reachable.add(target);
        stack.push(target);
      }
    }
  }

  const reverseAdj = new Map<number, number[]>();
  for (const st of dfa.states) {
    if (!reachable.has(st.id)) continue;
    for (const target of st.transitions.values()) {
      if (!reachable.has(target)) continue;
      const arr = reverseAdj.get(target);
      if (arr) {
        arr.push(st.id);
      } else {
        reverseAdj.set(target, [st.id]);
      }
    }
  }

  const coAccessible = new Set<number>();
  const revStack: number[] = [];
  for (const st of dfa.states) {
    if (reachable.has(st.id) && st.accepting) {
      coAccessible.add(st.id);
      revStack.push(st.id);
    }
  }

  while (revStack.length > 0) {
    const id = revStack.pop()!;
    const preds = reverseAdj.get(id);
    if (!preds) continue;
    for (const p of preds) {
      if (!coAccessible.has(p)) {
        coAccessible.add(p);
        revStack.push(p);
      }
    }
  }

  // Empty language iff no reachable & co-accessible accepting state exists.
  let empty = true;
  for (const st of dfa.states) {
    if (st.accepting && reachable.has(st.id) && coAccessible.has(st.id)) {
      empty = false;
      break;
    }
  }

  // Finite language iff there is no cycle in the reachable & co-accessible subgraph.
  const finite = isFiniteLanguage(dfa, reachable, coAccessible);

  return {
    states: totalStates,
    finite,
    capsHit: capped || undefined,
    empty,
  };
}

function isFiniteLanguage(
  dfa: ProductDfa,
  reachable: Set<number>,
  coAccessible: Set<number>
): boolean {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<number, number>();

  const dfs = (id: number): boolean => {
    color.set(id, GRAY);
    const st = dfa.states[id];
    if (!st) {
      color.set(id, BLACK);
      return true;
    }
    for (const target of st.transitions.values()) {
      if (!reachable.has(target) || !coAccessible.has(target)) {
        continue;
      }
      const c = color.get(target) ?? WHITE;
      if (c === GRAY) {
        // Cycle detected.
        return false;
      }
      if (c === WHITE) {
        if (!dfs(target)) {
          return false;
        }
      }
    }
    color.set(id, BLACK);
    return true;
  };

  const start = dfa.start;
  if (!reachable.has(start)) {
    return true;
  }

  for (const id of reachable) {
    if (!coAccessible.has(id)) continue;
    const c = color.get(id) ?? WHITE;
    if (c === WHITE) {
      if (!dfs(id)) {
        return false;
      }
    }
  }

  return true;
}

function dfaStep(
  dfa: Dfa,
  stateId: number,
  codeUnit: number
): number | undefined {
  const state = dfa.states[stateId];
  if (!state) return undefined;

  let nextId: number | undefined;
  for (const [from, target] of state.transitions.entries()) {
    if (codeUnit >= from) {
      nextId = target;
    } else {
      // transitions are inserted in ascending order; we can stop once from > codeUnit
      break;
    }
  }

  return nextId;
}

export function buildProductDfa(
  components: Dfa[],
  options?: ProductBuildOptions
): ProductBuildResult {
  if (components.length === 0) {
    const empty: ProductDfa = {
      start: 0,
      states: [
        {
          id: 0,
          tuple: [],
          accepting: true,
          transitions: new Map(),
        },
      ],
      accepts: () => true,
    };
    const summary = computeProductSummary(empty, false);
    return { dfa: empty, stateCount: 1, capped: false, summary };
  }

  const maxStates = options?.maxProductStates ?? 4096;
  const states: ProductDfaState[] = [];
  const seen = new Map<string, number>();
  const queue: ProductDfaState[] = [];

  const encodeTuple = (tuple: number[]): string => tuple.join(',');

  const createState = (tuple: number[]): ProductDfaState => {
    const key = encodeTuple(tuple);
    const existing = seen.get(key);
    if (existing !== undefined) {
      return states[existing]!;
    }
    const id = states.length;
    const accepting = components.every((dfa, idx) => {
      const st = dfa.states[tuple[idx]!]!;
      return st.accepting;
    });
    const state: ProductDfaState = {
      id,
      tuple,
      accepting,
      transitions: new Map(),
    };
    states.push(state);
    seen.set(key, id);
    queue.push(state);
    return state;
  };

  // Initial tuple is the start state of each component DFA.
  const startTuple = components.map((dfa) => dfa.start);
  const startState = createState(startTuple);

  let capped = false;

  while (queue.length > 0) {
    const current = queue.shift()!;
    const tuple = current.tuple;

    // Gather all transition keys (segment starts) from component states.
    const pointSet = new Set<number>();
    for (let i = 0; i < components.length; i += 1) {
      const dfa = components[i]!;
      const st = dfa.states[tuple[i]!]!;
      for (const from of st.transitions.keys()) {
        pointSet.add(from);
      }
    }
    if (pointSet.size === 0) {
      continue;
    }

    const points = Array.from(pointSet.values()).sort((a, b) => a - b);

    for (const from of points) {
      const nextTuple: number[] = [];
      let hasDead = false;
      for (let i = 0; i < components.length; i += 1) {
        const dfa = components[i]!;
        const next = dfaStep(dfa, tuple[i]!, from);
        if (next === undefined) {
          hasDead = true;
          break;
        }
        nextTuple.push(next);
      }
      if (hasDead) {
        continue;
      }
      const target = createState(nextTuple);
      current.transitions.set(from, target.id);
      if (states.length > maxStates) {
        capped = true;
        break;
      }
    }

    if (capped) {
      break;
    }
  }

  const productDfa: ProductDfa = {
    start: startState.id,
    states,
    accepts(input: string): boolean {
      let currentId = this.start;
      for (let i = 0; i < input.length; i += 1) {
        const code = input.charCodeAt(i);
        const state = this.states[currentId];
        if (!state) return false;

        let nextId: number | undefined;
        for (const [from, target] of state.transitions.entries()) {
          if (code >= from) {
            nextId = target;
          } else {
            break;
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
    dfa: productDfa,
    stateCount: states.length,
    capped,
    summary: computeProductSummary(productDfa, capped),
  };
}
