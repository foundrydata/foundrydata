Task: 6   Title: Decide emptiness & finiteness
Anchors: [spec://§0#terminology, spec://§1#goal, spec://§3#apfalse-unsafe-pattern-policy, spec://§4#pipeline, spec://§8#acceptance-tests]

Touched files:
- PLAN.md
- packages/core/src/transform/name-automata/product.ts
- packages/core/src/transform/__tests__/product-dfa.spec.ts

Approach:
This task extends the product DFA module so that Compose can decide, for a given AP:false object, whether the name language is empty (no accepting paths) and whether it is finite (no cycles on states that can reach acceptance). I will add graph analysis helpers on top of the product DFA structure: one to mark states reachable from the start, one to find states co-accessible to any accepting state, and a cycle detector restricted to this co-accessible subgraph. The product builder will then return a small summary object `{states, finite, capsHit?}` alongside the existing flags so that downstream code can emit `UNSAT_AP_FALSE_EMPTY_COVERAGE` when the language is provably empty and set `nameDfaSummary` and `NAME_AUTOMATON_COMPLEXITY_CAPPED` diagnostics when caps are hit. Unit tests will construct product DFAs for clearly empty vs non-empty combinations and for finite vs infinite patterns (e.g., with and without self-loops), asserting that emptiness and finiteness are detected correctly and that caps propagate into the summary when maxProductStates is used.

Risks/Unknowns:
- Care must be taken to run cycle detection only on the co-accessible subgraph to avoid unnecessary work and false positives for infinite languages that are irrelevant to acceptance.
- The summary will initially be internal to the product module; wiring it into diagnostics and CoverageIndex will be handled by later tasks.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
