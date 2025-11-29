Task: 9309   Title: Add boundaries coverage dimension and instrumentation (M2)
Anchors: [cov://§3#coverage-model, spec://§8#numbers-multipleof]
Touched files:
- packages/core/src/coverage/analyzer.ts
- packages/core/src/coverage/__tests__/analyzer.test.ts
- .taskmaster/docs/9309-traceability.md

Approach:
For 9309.9309001, I will extend the coverage analyzer so it discovers numeric, string and array boundary constraints directly from the canonical schema and materializes `boundaries`-dimension CoverageTargets in a way that is deterministic and consistent with the existing coverage model (cov://§3#coverage-model). Concretely, I will scan each canonical schema node for numeric bounds (`minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`-related) using the same numeric-likeness checks that Compose already relies on, and create `NUMERIC_MIN_HIT` / `NUMERIC_MAX_HIT` targets anchored at the schema’s canonical pointer with params that record which keyword and value they correspond to, without attempting to introduce any new numeric optimality logic beyond what the numeric planning layer already provides (spec://§8#numbers-multipleof). I will do the same for string (`minLength`/`maxLength`) and array (`minItems`/`maxItems`) constraints, emitting `STRING_MIN_LENGTH_HIT`, `STRING_MAX_LENGTH_HIT`, `ARRAY_MIN_ITEMS_HIT` and `ARRAY_MAX_ITEMS_HIT` targets at the corresponding schema locations. The analyzer will respect `dimensionsEnabled` so boundaries targets are only materialized when the `boundaries` dimension is requested, and it will continue to pipe UNSAT information from Compose via existing diagnostics so empty-domain cases naturally mark associated targets as `status:'unreachable'` alongside other targets on the same canonPath. I will update the analyzer unit tests to assert that boundaries targets are created for numeric, string and array constraints, that they are gated solely by `dimensionsEnabled`, and that existing structure/branches/enum behavior (including determinism and ID stability for a fixed canonical view) remains unchanged.

Risks/Unknowns:
- Ensuring that boundary targets align with the effective numeric domains derived by Compose (especially when `multipleOf` interacts with inclusive/exclusive bounds) may require follow-up work in 9309.9309003 to refine reachability, so this subtask must avoid baking in assumptions that contradict future UNSAT-based handling.
- The analyzer currently assumes a simple graph over schema/property/branch nodes; extending target discovery for boundaries without adding explicit constraint nodes means later planner stages must still be able to reason about boundary targets using only canonPath and params, which should be validated by unit tests.
- Adding new target kinds increases the total target count for some schemas; although this subtask deliberately avoids changing planner caps or dimension ordering, there is a small risk that downstream tests depending on exact target counts may need to be refreshed once boundaries are fully wired into guided planning.

Parent bullets couverts: [KR1, DEL1, DOD1, TS1]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
