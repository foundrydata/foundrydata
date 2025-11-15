Task: 18   Title: Acceptance tests: objects automata
Anchors: [spec://§0#terminology, spec://§1#goal, spec://§1#acceptance]

Touched files:
- PLAN.md
- packages/core/src/transform/__tests__/name-automata/bfs.spec.ts
- packages/core/src/transform/__tests__/name-automata/product-summary.spec.ts
- packages/core/test/e2e/pipeline.integration.spec.ts

Approach:
I will add focused tests around the name-automata subsystem and the pipeline integration layer to exercise the SPEC-mandated behaviour for AP:false objects. At the transform level, I will extend the existing BFS tests and add a small product-summary suite to cover DFA/product-DFA emptiness, finiteness, and BFS witness ordering over simple regular languages, including empty, finite, and infinite cases; these tests will use only the public NFA→DFA and product builders plus the BFS enumerator, mirroring the objects-automata definitions without copying SPEC prose. At the pipeline level, I will add acceptance tests that run `executePipeline` on carefully constructed AP:false object schemas: one where anchored-safe `patternProperties` drive coverage and the coverage index uses BFS-backed `enumerate()` to return witnesses ordered by length then UTF-16; one where `propertyNames` gating rejects a required key and yields `UNSAT_REQUIRED_VS_PROPERTYNAMES`; one where the finite must-cover set is smaller than `minProperties` and yields `UNSAT_MINPROPERTIES_VS_COVERAGE`; and one where the product name automaton is provably empty under presence pressure, yielding `UNSAT_AP_FALSE_EMPTY_COVERAGE` without relying on unsafe patterns. All new tests will assert both diagnostics (codes, canonPath, and key details) and the observable CoverageIndex behaviour (has/enumerate), keeping the implementation deterministic with fixed seeds and avoiding any changes to the core composition engine logic itself.

Risks/Unknowns:
- The precise interaction between propertyNames gating, presence pressure, and automaton emptiness is subtle; tests must be aligned with the existing implementation to avoid over-constraining diagnostics where the SPEC intentionally allows conservative fallbacks.
- The existing `pipeline.integration.spec.ts` file is already large; adding more cases here increases test runtime slightly, so scenarios should remain minimal while still covering the required diagnostics and witness behaviour.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
