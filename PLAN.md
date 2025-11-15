Task: 5   Title: Product/intersection DFA for AP:false conjuncts
Anchors: [spec://§0#terminology, spec://§1#goal, spec://§3#apfalse-unsafe-pattern-policy, spec://§4#pipeline, spec://§8#acceptance-tests]

Touched files:
- PLAN.md
- packages/core/src/transform/name-automata/product.ts
- packages/core/src/transform/__tests__/product-dfa.spec.ts

Approach:
This task composes per-conjunct DFAs (properties, patternProperties, and propertyNames guards) into a single product DFA that represents the intersection language required by AP:false must-cover semantics. I will implement a product construction over an array of DFAs, where each product state is a tuple of component state IDs, and the accepting condition is that all components are in accepting states. During construction I will track reachability from the product start state and prune unreachable states, and I will enforce a maxProductStates cap that short-circuits construction and returns a capped result that callers can treat as “approximate but sound”. The product module will expose a small API that returns the product DFA, the number of states, and a capped flag so that Compose can later emit NAME_AUTOMATON_COMPLEXITY_CAPPED diagnostics when used under AP:false with presence pressure. Unit tests will create small DFAs for simple literal and pattern-based name languages, verify that the product accepts exactly the intersection, and exercise the cap path by setting a very low maxProductStates and checking that the capped flag is set while still preserving soundness (no false positives).

Risks/Unknowns:
- The product DFA may grow quickly in state count even for modest inputs; caps must be conservative but not so tight that they prevent useful intersections in realistic schemas.
- NAME_AUTOMATON_COMPLEXITY_CAPPED diagnostics will be wired in a later integration task; this module will focus on returning enough metadata for Compose to decide when to emit them.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
