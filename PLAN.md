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

Task: 15   Title: Repair engine consistency & stagnation guard
Anchors: [spec://§4#pipeline, spec://§8-composition-engine, spec://§9#generator, spec://§10-repair-engine, spec://§21-risks]

Touched files:
- PLAN.md
- packages/core/src/repair/repair-engine.ts
- packages/core/src/repair/__tests__/stagnation-guard.test.ts
- packages/core/test/e2e/pipeline.integration.spec.ts

Approach:
This task tightens the AJV-driven repair engine so that repairs are both idempotent and explicitly budgeted, and so that a stagnation guard signals when repeated gen→repair→validate cycles cannot make progress. At the engine level, I will keep the existing per-item inner loop but track the error count before each repair pass; iterations will stop early when a pass makes no changes or when the AJV error count fails to decrease. I will wire the loop’s attempt bound to repair options while leaving the long-horizon `complexity.bailOnUnsatAfter` as the outer pipeline budget, so that createDefaultRepair can remain a thin wrapper over repairItemsAjvDriven without embedding cross-stage policy. When the engine exhausts its attempt budget for an item while errors remain, it will surface this as a repair-stage diagnostic using UNSAT_BUDGET_EXHAUSTED, recording how many passes were attempted and the last observed AJV error count, while still returning the best-effort repaired instance for Validate to see. I will add unit tests that construct schemas which deliberately fail to converge under the current actions (e.g., oscillating pattern/length or conflicting constraints) to assert that repeated calls are idempotent, that error counts are monotone non-increasing across iterations, and that UNSAT_BUDGET_EXHAUSTED is emitted with a valid envelope when the guard trips. Finally, I will extend the pipeline integration tests to exercise a repair-heavy schema, checking that repair diagnostics are attached to the repair stage only and that validate still enforces the final AJV result, so the stagnation guard behaves as a cross-stage budget without changing correctness.

Risks/Unknowns:
- Error-count based stagnation checks must not misfire on schemas where AJV rewrites or reorders errors between passes; tests need to focus on stable patterns where counts reflect real progress.
- Introducing UNSAT_BUDGET_EXHAUSTED at the repair stage must be coordinated with later tasks that may add cross-stage loops, so I will keep the diagnostic payload minimal and compatible with the existing diag schemas.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true

Task: 14   Title: Generator integration with CoverageIndex
Anchors: [spec://§1#goal, spec://§4#pipeline, spec://§8#coverage-index-enumerate, spec://§9#generator, spec://§9#objects-minimal-width]

Touched files:
- PLAN.md
- packages/core/src/generator/foundry-generator.ts
- packages/core/test/unit/generator.spec.ts
- packages/core/test/e2e/pipeline.integration.spec.ts

Approach:
Building on the existing must-cover automata and CoverageIndex from Compose, this task focuses on making the generator’s key selection and value witnesses align tightly with the coverage API while preserving determinism. For object generation, I will treat CoverageIndex.has as the single source of truth for which names are eligible, ensuring that all paths that introduce keys (including required, dependentRequired, conditional hints, and minProperties fillers) consistently gate through the same predicate and respect the minimal-width policy that prefers required keys and only adds optional ones when strictly necessary. Where a finite coverage enumeration is available for an object, generator logic will rely on lexicographically ordered candidate names from properties and anchored-safe pattern witnesses, filtered by CoverageIndex, so that optional keys used to satisfy minProperties are stable and never expand beyond the must-cover intersection or unsafe propertyNames-only domains. For primitive witnesses, I will keep const/enum precedence over type while tightening the numeric and string generators to emit the smallest admissible values compatible with the compose-stage bounds and rational multipleOf rules, so that fillers for arrays and objects use the same earliest-stable generator ordering across runs and seeds. Array generation will continue to satisfy contains needs via the bag extracted in Compose, but I will verify and, if needed, refine the flow so that under uniqueItems the algorithm de-duplicates first, then deterministically re-satisfies all remaining contains needs before filling any extra slots with minimal-stable witnesses, without reordering targeted items. I will add focused tests at the unit and pipeline levels that assert stable outputs for fixed seeds, correct interaction with CoverageIndex for AP:false objects, and the expected interplay between contains, uniqueItems, and minimal fillers.

Risks/Unknowns:
- The generator already has partial integrations for CoverageIndex and contains bags; tightening behavior must avoid regressions in existing tests while still honoring stricter minimal-width and witness requirements.
- Numeric witness behavior must remain consistent with Ajv’s multipleOf and bounds semantics even as we bias toward minimal values, so adjustments need to be validated carefully against edge cases.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true

Task: 16   Title: Validate stage: enforce AJV parity & metrics
Anchors: [spec://§0#philosophy-invariants, spec://§1#acceptance, spec://§1-config-gate, spec://§5-diagnostics-observability-coverage, spec://§6-non-functional-constraints]

Touched files:
- PLAN.md
- packages/core/src/pipeline/orchestrator.ts
- packages/core/src/repair/repair-engine.ts
- packages/core/test/e2e/pipeline.integration.spec.ts

Approach:
This task hardens the Validate stage so that AJV always acts as the oracle on the original schema while exposing consistent observability and metrics. I will keep the dual-AJV startup gate (source vs planning) but enrich the AJV parity diagnostic with a metrics payload derived from the shared MetricsCollector, ensuring that parity failures still carry per-run SLO context such as validations per row and latency/memory counters. On the metrics side, I will thread the collector into the default repair runner and the AJV-driven repair engine so that each successful repair iteration increments repairPassesPerRow, matching the existing validationsPerRow accounting in Validate and letting the bench harness compute per-row averages over sample sizes. The Validate stage will continue to compile against a semantics-preserving view of the original schema and attach diagnostics only in the Validate phase, with strict mode still treating external $ref failures as hard errors and lax mode emitting EXTERNAL_REF_UNRESOLVED with skippedValidation evidence and zero validations per row. Finally, I will extend the end-to-end pipeline tests to cover both parity failures and repair-heavy runs: one scenario will deliberately desynchronize planning AJV flags to assert that an AJV parity error surfaces with metrics attached, and another will override the generator to produce invalid items so that the repair stage performs at least one pass and the resulting metrics show a positive repairPassesPerRow count.

Risks/Unknowns:
- Threading the metrics collector into the repair engine must not perturb the public repairItemsAjvDriven API for existing callers; the new hook must remain optional and side-effect-only.
- Attaching metrics to parity diagnostics needs to remain lightweight and respect verbosity settings so CI-style runs can rely on them without incurring heavy payloads in runtime mode.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true

Task: 12   Title: Numbers: bounds & rational multipleOf
Anchors: [spec://§1#goal, spec://§4#pipeline, spec://§8#numbers-multipleof, spec://§23#plan-options, spec://§8#early-unsat-checks]

Touched files:
- PLAN.md
- packages/core/src/transform/numbers/bounds.ts
- packages/core/src/transform/numbers/multiple-of.ts
- packages/core/src/transform/composition-engine.ts
- packages/core/src/diag/codes.ts
- packages/core/src/diag/schemas.ts
- packages/core/src/transform/__tests__/numbers/bounds.spec.ts
- packages/core/src/transform/__tests__/numbers/multiple-of.spec.ts

Approach:
This task introduces a small numeric analysis layer in the compose stage so that obvious bound contradictions are detected early and reported as structured diagnostics, while also providing helpers for rational multipleOf checks that align with Ajv’s epsilon-based semantics. I will add a `numbers/bounds` module that normalizes `minimum/maximum/exclusive*` into a canonical lower/upper pair, derives an integer-domain view when `type:'integer'` is in effect, and exposes a pure `checkNumericBounds` function that returns whether the real or integer domain is empty using only monotone comparisons. The composition engine will call this helper for numeric-like schemas (including ones that only express bounds without an explicit `type`), and when a contradiction is proven it will emit a compose-phase fatal diagnostic `UNSAT_NUMERIC_BOUNDS` whose details capture the reason and the raw bound keywords so downstream tooling and tests can assert on behavior. In parallel, I will add a `numbers/multiple-of` module that wraps the existing rational helpers with a `createMultipleOfContext` function and `isAjvMultipleOf` / `snapToNearestMultiple` utilities, ensuring multipleOf checks and snapping use the same `decimalPrecision`-driven tolerance as the planning Ajv when fallback is `decimal` or `float`. Unit tests will exercise the helpers directly (including integer vs real range reasoning and Ajv parity for multipleOf), and composition-engine tests will assert that contradictory numeric schemas surface the new diagnostic without altering existing behavior for satisfiable bounds.

Risks/Unknowns:
Numeric contradictions that depend on cross-branch `allOf` interactions or deep rational reasoning beyond simple bounds are intentionally left for later tasks to avoid overreaching this change, so coverage is limited to local bound inconsistencies and integer-domain emptiness at a single node.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true

Task: 11   Title: Arrays: bagged contains + UNSAT rules
Anchors: [spec://§0#terminology, spec://§1#goal, spec://§4#pipeline, spec://§8#early-unsat-checks, spec://§9#arrays-contains]

Touched files:
- PLAN.md
- packages/core/src/transform/arrays/contains-bag.ts
- packages/core/src/transform/composition-engine.ts
- packages/core/src/generator/foundry-generator.ts
- packages/core/src/index.ts

Approach:
This task consolidates the array `contains` handling into a dedicated transform module that implements the SPEC’s bag semantics and early UNSAT reasoning while keeping AJV as the oracle. I will extract the existing ContainsNeed structure, allOf aggregation and subsumption, and the effective maxItems computation from the composition engine into `transform/arrays/contains-bag.ts`, preserving the normalized bag shape and the current disjointness and subset checks for needs. The composition engine will delegate to this module to build and normalize the bag and then apply the existing early-UNSAT rules: per-need min/max sanity checks, Σ min_i versus the effective maxItems bound, provable disjointness vs overlap-unknown hints, and subset-contradiction between needs with positive min and blockers with max = 0. The generator already enforces the bag and `uniqueItems` ordering, so I will rewire it to consume the ContainsNeed type from the new module without changing behavior, keeping the minimal-length policy and the deterministic “de-dup → re-satisfy bag → enforce uniqueItems” order. I will rely on the current composition-engine tests for bag construction, UNSAT diagnostics, and caps, plus the generator and repair tests for contains, to validate that the refactor preserves observable outputs while making the arrays logic reusable for future SMT-backed extensions.

Risks/Unknowns:
- Moving helper functions for subset and disjointness checks into a shared arrays module must not alter their semantics or introduce subtle differences in how schemas are compared across phases.
- If per-file coverage drops for the new module after extraction, I may need to add a focused unit test to exercise edge cases without duplicating the existing composition-engine scenarios.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true

Task: 9   Title: Early-UNSAT diagnostics for objects
Anchors: [spec://§1#goal, spec://§3#apfalse-unsafe-pattern-policy, spec://§4#pipeline, spec://§8#apfalse-must-cover, spec://§8#early-unsat-checks]

Touched files:
- PLAN.md
- packages/core/src/diag/codes.ts
- packages/core/src/diag/schemas.ts
- packages/core/src/transform/composition-engine.ts
- packages/core/src/transform/__tests__/composition-engine.test.ts

Approach:
This task refines the composition engine’s object-level early-UNSAT reasoning on top of the AP:false must-cover automata so that diagnostics match the P1 spec. Building on the existing CoverageIndex and name automata, I will treat the global language A (intersection of DFA conjuncts plus propertyNames gating) as the single source of truth for object key feasibility. First, I will ensure `UNSAT_AP_FALSE_EMPTY_COVERAGE` is emitted consistently when A is provably empty under presence pressure, using the existing emptiness and presence detectors and carrying a small proof summary in details. Next, I will introduce two new compose-phase diagnostics: `UNSAT_REQUIRED_VS_PROPERTYNAMES` when any required key is rejected by A, and `UNSAT_MINPROPERTIES_VS_COVERAGE` when A is finite and its cardinality is strictly less than `minProperties`. These checks will run after the coverage predicate and any finite enumeration are available, reusing the same candidate sets and respecting the prohibition on exposing enumerate() when finiteness derives solely from raw propertyNames.enum. I will update the diagnostic code table, detail schemas, and phase allow-list, then extend the composition-engine tests and end-to-end pipeline tests with acceptance scenarios that cover each UNSAT case and assert the expected payload shapes.

Risks/Unknowns:
- Care is needed to avoid double-reporting legacy propertyNames UNSAT codes and the new coverage-based ones; this task will prefer coverage-based diagnostics while keeping legacy behavior only where the automata path does not apply.
- Computing finite coverage size must respect existing caps and guardrails so that UNSAT_MINPROPERTIES_VS_COVERAGE is emitted only when finiteness and cardinality are provable without relying on unsafe patterns.

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

Task: 10   Title: Strict/Lax policy for AP:false and external $ref
Anchors: [spec://§1#goal, spec://§3#apfalse-unsafe-pattern-policy, spec://§4#pipeline, spec://§8#apfalse-must-cover, spec://§11-external-ref-probe]

Touched files:
- PLAN.md
- packages/core/src/transform/composition-engine.ts
- packages/core/src/transform/__tests__/composition-engine.test.ts
- packages/core/test/e2e/pipeline.integration.spec.ts

Approach:
This task wires the SPEC’s Strict/Lax policy knobs into both the AP:false unsafe-pattern handling and the external $ref flow so that behavior is controlled uniformly by pipeline mode plus the dedicated policy options. For AP:false, I will keep the existing must-cover and presence-pressure machinery but gate the fatal AP_FALSE_UNSAFE_PATTERN diagnostic on both Strict mode and patternPolicy.unsafeUnderApFalse === 'error', downgrading it to a warning when callers opt into 'warn' while still enforcing conservative exclusion via the existing CoverageIndex. For external $ref, I will rely on the existing classification and probe logic but ensure diagnostics always carry the correct {mode, policy?, skippedValidation?} payload and that Strict mode continues to treat EXTERNAL_REF_UNRESOLVED as a hard failure regardless of policy, while Lax mode only skips validation when the failure is exclusively attributable to external refs. I will add focused unit tests at the composition-engine layer and end-to-end pipeline tests to cover Strict vs Lax behavior and the policy overrides, keeping diagnostics envelopes conformant with the diag schemas.

Risks/Unknowns:
- Changing the severity of AP_FALSE_UNSAFE_PATTERN under a 'warn' policy must not alter coverage or key generation semantics, only whether Compose causes the pipeline to fail fast.
- External-ref diagnostics already exist; care is needed to avoid duplicating or changing codes while tightening payloads and policies.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
