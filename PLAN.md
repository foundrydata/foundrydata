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

Task: 7   Title: BFS witnesses (shortest then UTF-16)
Anchors: [spec://§1#goal, spec://§3#apfalse-unsafe-pattern-policy, spec://§4#pipeline, spec://§4#must-cover-under-additionalproperties-false, spec://§8#acceptance-tests]

Touched files:
- PLAN.md
- packages/core/src/transform/name-automata/bfs.ts
- packages/core/src/transform/__tests__/name-automata/bfs.spec.ts

Approach:
This task introduces a small, focused BFS module for name automata that can enumerate witness property names in a way that matches the JSG-P1 ordering requirements. I will implement a generic breadth-first search over DFAs (including the existing product DFA) that walks transitions keyed by UTF-16 code units, always exploring shorter words first and, within each length, ordering outgoing edges by increasing code unit. For each visited state, when it is accepting, the current word is recorded as a witness while the search continues until either k witnesses are found or a configurable candidate budget is exhausted. The BFS will respect caps via a simple configuration object (maximum word length and maximum explored edges), returning a result that includes the discovered witnesses, the number of candidates tried, and whether the search hit its budget. New unit tests under transform/__tests__/name-automata will exercise three scenarios: basic two-vs three-letter ordering, the spec’s `(x|y)[a-z]` acceptance example to ensure witnesses are `["xa","ya"]`, and a product-DFA scenario to confirm that ordering and acceptance properties hold when composing multiple conjunct automata.

Risks/Unknowns:
- The existing DFA and product DFA implementations approximate character ranges; the BFS module must work with these approximations without attempting to “fix” them in this task.
- Caps are surfaced only via the BFS result structure for now; wiring these into diagnostics and CoverageIndex will be handled by later tasks.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true

Task: 8   Title: Compose integration & CoverageIndex
Anchors: [spec://§1#goal, spec://§3#apfalse-unsafe-pattern-policy, spec://§4#must-cover-under-additionalproperties-false, spec://§4#decision-finiteness-witnesses, spec://§8#acceptance-tests]

Touched files:
- PLAN.md
- packages/core/src/transform/composition-engine.ts

Approach:
This task wires the name automata subsystem into the composition stage so that CoverageIndex is backed by the product DFA described in the spec. For each AP:false object (including allOf conjuncts), I will treat exact property keys as single-word DFAs, compile anchored-safe patternProperties via NFA→DFA with caps, and treat propertyNames as guard-only unless a future flag-gated rewrite explicitly marks synthetic patterns. The product DFA across all relevant conjunct DFAs will provide a precise must-cover language A; CoverageIndex.has(name) will delegate to this product automaton, and when finiteness is proven I will use the existing BFS helper to implement enumerate(k) with shortest-length-then-UTF-16 ordering, while still honoring the prohibition on exposing enumerate() when finiteness comes solely from raw propertyNames.enum without rewrite evidence. I will also surface a compact nameDfaSummary (states, finite, capsHit?) in diagnostics to align with the observability requirements, and keep the existing early-UNSAT logic in place for contexts where automata are not yet applied.

Risks/Unknowns:
- The current heuristic coverageIndex implementation is already used by generator tests; integration must be done carefully to preserve observable behavior where the spec requires it, while making coverage semantics more precise under AP:false.
- nameDfaSummary will be produced internally in CompositionEngine for now; additional wiring into public diagnostics surfaces may be required by later tasks.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
