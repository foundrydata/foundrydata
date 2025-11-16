# JSG-P1 Requirements Analysis — Automata & Bounded SMT

## Executive Summary

The JSG-P1 Automata & Bounded SMT spec defines a deterministic JSON Schema generator whose final authority is AJV running on the original schema. The pipeline is split into Normalize → Compose → Generate → Repair → Validate and is constrained by strict invariants: no network I/O in the core, deterministic behavior for a fixed (seed, options, AJV, registry) tuple, and diagnostics emitted through a stable `{code, canonPath, details}` envelope. Normative requirements concentrate around exact name coverage for `additionalProperties:false` using capped automata, sound reasoning for arrays and numbers (optionally assisted by a local SMT solver under timeout), and robust observability and performance SLOs (p95 latency and memory caps). Tasks 1–20 implement this behavior incrementally: first establishing AJV parity, RNG, and diagnostics; then regex policy and name automata; then arrays/numbers and optional SMT; then generator/repair integration; finally validation, CLI/OpenAPI integration, and acceptance/unit test suites.

## Pipeline Phase Requirements

### Stage 1: Normalize

- Produce a canonical 2020-12 view of the schema without mutating the original, including standard rewrites (e.g., tuple/defs unification) while honoring any guards from `unevaluated*` by skipping unsafe simplifications and recording notes instead.
- Prepare the inputs necessary for later phases: a consistent pointer map from canonical locations back to original `canonPath` values, the initial AJV planning instance configured with the same options as the final AJV instance, and seeded deterministic RNG hooks keyed by `(seed, canonPath)`.
- Classify regex patterns and structural features that influence later automata and array/number reasoning, but avoid performing any coverage proofs or UNSAT decisions in this phase.

### Stage 2: Compose

- Enforce anchored-safe regex policy and complexity caps: patterns are classified as safe or non-safe/capped, with diagnostics when compilation or complexity checks fail; unsafe/capped patterns are treated strictly as guards and are never used for proofs or enumeration.
- For each `allOf` conjunct enforcing `additionalProperties:false`, construct per-conjunct DFAs for literal `properties` and anchored-safe `patternProperties`, treat `propertyNames` as a guard-only intersection by default, and optionally apply additive rewrites under tight preconditions behind a feature flag that records `PNAMES_REWRITE_APPLIED`.
- Build a product automaton as the intersection of all relevant DFAs, enforcing caps on automaton size, product state count, and enumeration budget; when caps are reached, emit complexity diagnostics and fall back to sound but potentially less precise behavior.
- Decide emptiness (no accepting state reachable) and finiteness (cycle analysis on the co-accessible subgraph) of the product automaton and expose a `nameDfaSummary` with state count, finiteness flag, and cap information.
- Expose a `CoverageIndex` with a pure `has(name)` operation and an optional `enumerate(k)` that is only available when finiteness is proven and not derived solely from a raw `propertyNames.enum`; track provenance for all coverage decisions.
- For arrays, interpret `contains` constraints as a bag of requirements, derive UNSAT conditions when the sum of minimum occurrences exceeds `maxItems`, reason about disjoint/unknown overlaps, and emit `UNSAT_CONTAINS_VS_MAXITEMS` where provable.
- For numbers, compute tight bounds and contradictions from min/max combinations and implement rational `multipleOf` reasoning consistent with AJV, including snapping behavior that respects bounds and avoids precision loss.
- Optionally use a local QF_LIA solver under strict timeout and feature flag control to combine numeric and array constraints; on timeout or unknown, emit `SOLVER_TIMEOUT` and fall back to rule-based reasoning without changing validation semantics.
- Enforce strict/lax policies around unsafe patterns under presence pressure and unresolved external `$ref`: strict mode fails fast with fatal diagnostics, while lax mode warns and may skip final validation only when failures are due exclusively to external references.

### Stage 3: Generate

- Drive object property name selection through `CoverageIndex`, using deterministic ordering based on BFS enumeration (shortest names first, then UTF-16 lexicographic order) and the seeded RNG where necessary, while preserving any conditional logic required by the broader generator.
- Produce minimal value witnesses for all types, preferring `enum`/`const` values where available and otherwise choosing deterministic minimal witnesses that remain consistent with AJV’s validation behavior.
- For arrays, generate data that first satisfies `contains` constraints (respecting the bag semantics and any UNSAT proofs) and then applies `uniqueItems` deduplication, staying within `minItems`/`maxItems` limits and honoring numeric `multipleOf` snapping decisions.
- Ensure the entire generation process is deterministic for a fixed `(seed, options, AJV.major, registry fingerprint)` tuple, with no reliance on global mutable state, wall-clock time, or environment-specific locale behavior.

### Stage 4: Repair

- Use AJV validation errors against the original schema to drive repair actions such as numeric bounds clamping, required property insertion, rational snapping, and `uniqueItems` deduplication, always operating in a way that is idempotent when reapplied.
- Maintain a repair loop that tracks error counts across passes, stops when errors no longer decrease, and enforces a maximum number of iterations via a stagnation guard (e.g., `bailOnUnsatAfter`) to avoid infinite loops on unsatisfiable inputs.
- Record diagnostics and metrics for repair passes, including how many iterations were performed and whether repairs successfully reduced error counts or terminated due to stagnation or explicit caps.

### Stage 5: Validate

- Perform final validation with AJV against the original (non-canonical) schema only; any divergence between planning AJV and final AJV options must be treated as a hard error and surfaced as a dedicated diagnostic.
- Ensure that every generated (and optionally repaired) instance either validates successfully or fails with actionable diagnostics, without altering the schema’s validation semantics or silently skipping checks except where strict/lax external `$ref` rules explicitly allow skipping.
- Collect and expose per-phase metrics: durations for Normalize, Compose, Generate, Repair, and Validate; counts such as `validationsPerRow` and `repairPassesPerRow`; and counts of cap hits for regex, automata, and SMT reasoning.

## Cross-Cutting Requirements

### Determinism

- All phases must be deterministic for a fixed seed and configuration, with RNG tied to `(seed, canonPath)` and no dependence on global/time/locale state.
- Branch selection, coverage decisions, witness ordering, and diagnostics must be reproducible across runs and platforms.

### Performance SLOs

- The pipeline must respect p95 latency and memory ceilings defined by the spec, relying on explicit caps for regex complexity, automata size, SMT solving, and repair iterations.
- Cap hits are not silent: they must be recorded in diagnostics or metrics so that degradations are observable.

### Error Handling

- Diagnostics use a stable envelope `{code, canonPath, details}` with a single canonical path per diagnostic and structured details describing the reason (e.g., cap hit, UNSAT proof, external ref failure, solver timeout).
- Policy decisions around strict vs lax modes, unsafe patterns, and external references must be implemented consistently and surfaced through these diagnostics rather than ad hoc exceptions.

### Observability

- The system must expose coverage-oriented structures (CoverageIndex with provenance, nameDfaSummary) and metrics (phase timings, validation/repair counters, cap hits) in a form that can be consumed by higher-level tools and benchmarks.
- Acceptance scenarios in the spec (e.g., DFA emptiness, BFS witnesses, unsafe patterns, required vs `propertyNames`, array UNSAT cases, determinism) must be reproducible via tests and visible in diagnostics and metrics.

## Implementation Priority Matrix

| Area                                   | Phase(s)                    | Tasks                        | Priority | Notes                                                                 |
|----------------------------------------|-----------------------------|------------------------------|----------|-----------------------------------------------------------------------|
| Invariants, AJV parity, RNG, envelope  | All (esp. Normalize/Validate) | 1, 16                       | High     | Foundation for deterministic behavior, AJV-oracle invariant, metrics. |
| Regex policy & name automata           | Normalize, Compose          | 2, 3, 4, 5, 6, 7, 8, 9, 10   | High     | Enables exact name coverage and early-UNSAT proofs for objects.       |
| Arrays, numbers, optional SMT          | Compose, Generate           | 11, 12, 13, 14              | High/Med/Low | Provides sound reasoning for arrays/numbers with bounded SMT assist. |
| Generator & repair integration         | Generate, Repair            | 14, 15                      | High/Med | Connects plans to concrete instances and AJV-driven repairs.          |
| Validation, CLI & OpenAPI drivers      | Validate, Cross-cutting     | 16, 17                      | High/Med | Surfaces functionality to users while enforcing AJV oracle and SLOs.  |
| Acceptance and unit tests              | All phases                  | 18, 19, 20                  | High/Med | Lock in behavior through object/array/regex/determinism tests.        |

## Task Dependencies Analysis

- Task 1 (invariants, dual AJV, RNG, diagnostics) underpins almost all subsequent work and should be implemented first, as later tasks rely on deterministic behavior and a shared diagnostic format.
- Tasks 2–8 form the name automata and CoverageIndex stack used during Compose; they depend on the RNG and diagnostics from task 1 and culminate in a coverage API that feeds the generator.
- Tasks 9 and 10 build early-UNSAT diagnostics and strict/lax policy enforcement on top of the automata stack, completing the object-side Compose semantics for `additionalProperties:false` and unsafe patterns/external references.
- Tasks 11–13 provide the arrays and numbers reasoning plus optional SMT assistance; they feed both Compose (for UNSAT proofs and constraint reasoning) and Generate (for array and numeric witness construction).
- Task 14 wires CoverageIndex and arrays/numbers logic into the generator, making the Normalize/Compose outputs observable in concrete instances.
- Task 15 builds the repair engine as a post-generation phase, relying on AJV diagnostics and numeric/array semantics to perform bounded, idempotent fixes.
- Task 16 finalizes the Validate stage and metrics collection, tying together the dual AJV invariant and per-phase timing/cap metrics.
- Task 17 exposes CLI flags and OpenAPI driver hooks, depending on generator and validate stages to provide deterministic, example-aware NDJSON fixtures.
- Tasks 18–20 close the loop with acceptance and unit tests that exercise automata, arrays, external refs, determinism, and low-level regex/NFA/DFA/product/numbers behavior, ensuring that the pipeline satisfies the JSG-P1 requirements end-to-end.

