Task: 4   Title: DFA subset construction + caps
Anchors: [spec://§0#terminology, spec://§1#goal, spec://§3#apfalse-unsafe-pattern-policy, spec://§4#pipeline, spec://§8#acceptance-tests]

Touched files:
- PLAN.md
- packages/core/src/transform/name-automata/dfa.ts
- packages/core/src/transform/__tests__/nfa-dfa-basic.spec.ts

Approach:
This task takes the Thompson NFA for anchored-safe patterns and determinizes it into a DFA suitable for name automata under AP:false, while enforcing explicit caps to avoid state explosion. I will implement classical subset construction over NfaState sets to build DfaStates with a transition table keyed by code-unit ranges, tracking the number of DFA states created and marking the result as capped when a configurable maxDfaStates limit is exceeded. On top of this I will add a UTF-16-compatible membership check that iterates through string code units in order and follows the DFA transitions, keeping behavior consistent with the NFA’s use of charCodeAt. A simple minimization step will be provided for small automata (e.g., merging obviously equivalent dead states) without over-optimizing, and the module will expose a compact API that returns the DFA, state counts, and cap flag for use in the later product/intersection and CoverageIndex tasks. Unit tests will extend the existing nfa-dfa-basic suite to compare NFA-based acceptance (via a small test-only interpreter) with DFA.accepts on simple and bounded patterns, and to exercise the cap path by constructing DFAs with artificially low maxDfaStates.

Risks/Unknowns:
- Care must be taken to keep the DFA representation small and predictable so it can be intersected later without triggering caps too eagerly.
- A full Hopcroft-style minimization may be overkill; a simpler heuristic minimizer may be preferable initially and refined in later tasks.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
