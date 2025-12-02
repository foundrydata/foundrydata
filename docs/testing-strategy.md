# Testing Strategy — Coverage‑aware Core & Tooling

This document describes the **testing strategy** for the coverage‑aware layer
and related JSON Schema features in FoundryData. It explains how we derive
tests from the SPEC, how we structure micro‑schemas, and which invariants we
expect to hold across `coverage=off|measure|guided` runs.

The goal is to move away from ad‑hoc scenarios and towards a **systematic,
traceable approach**: SPEC → motifs → micro‑schemas → tests → invariants.

---

## 1. Scope & Goals

Scope for this strategy:

- Coverage‑aware features: coverage targets, coverage-report/v1, Planner,
  guided runs and CLI coverage UX.
- JSON Schema motifs that interact strongly with coverage and planning:
  `oneOf`/`anyOf`, conditionals, AP:false / CoverageIndex, arrays
  (`contains`, `prefixItems`), dependencies, `unevaluated*`, etc.
- Core pipeline invariants across `coverage=off|measure|guided`.

Goals:

- Keep coverage behavior **aligned with the SPEC** (canonical + coverage-aware).
- Make it easy to see **what is tested and why**, via `docs/tests-traceability.md`.
- Catch regressions early with **invariants** that run across multiple schemas,
  not seulement sur quelques scénarios “marketing”.

---

## 2. Principles

The testing strategy is built on six principles:

1. **Model‑driven**: tests are derived from SPEC + JSON Schema grammar,
   not from intuition or isolated examples.
2. **Micro‑schemas (“schema zoo”)**: each motif we care about (e.g. `contains`,
   `dependentRequired`) has a minimal schema that isolates it.
3. **Invariants first**: we prefer generic properties (determinism, non‑regression,
   AP:false invariants, diag shapes) to scenario‑specific assertions.
4. **Systematic generation**: where possible, we generate small families of schemas
   and apply invariants to all of them.
5. **SPEC ↔ tests traceability**: each motif/test is linked to SPEC anchors
   (`spec://`, `cov://`) and recorded in `docs/tests-traceability.md`.
6. **Mutation‑aware**: for critical invariants, we expect the test suite to fail
   under simple synthetic regressions (long‑term goal).

---

## 3. Test Layers

We structure tests in three main layers.

### 3.1 Unit tests — Instrumentation & Analyzer

Location:

- Generator coverage events: `packages/core/src/generator/__tests__/…`
- Analyzer / CoverageGraph / Evaluator: `packages/core/src/coverage/__tests__/…`

Purpose:

- Validate that **coverage events** (`ONEOF_BRANCH`, `ENUM_VALUE_HIT`,
  `CONDITIONAL_PATH`, boundaries, `PROPERTY_PRESENT`) are emitted with the
  correct `dimension`, `kind`, `canonPath`, `params`.
- Validate that the **CoverageAnalyzer** produces the expected `targets[]`
  and graph nodes (SCHEMA_NODE, PROPERTY_PRESENT, branches, boundaries)
  for each micro‑schema.

These tests are tied to motifs and anchors as documented in
`docs/tests-traceability.md`.

### 3.2 End‑to‑end tests — Pipeline & coverage‑report

Location:

- Core pipeline e2e: `packages/core/test/e2e/*.spec.ts`
- Reporter integration: `packages/reporter/test/*.test.ts`

Purpose:

- Exercise the **full pipeline** (Normalize → Compose → Generate → Repair → Validate)
  on carefully chosen schemas (examples + micro‑schemas).
- Assert invariants on:
  - `PipelineResult.status`, `stages.validate.output.errors`,
  - `artifacts.generated.items` / `artifacts.repaired`,
  - `artifacts.coverageMetrics` / `artifacts.coverageReport`.

Examples:

- Determinism off vs measure (same items).  
- Non‑regression guided ≥ measure sur `branches` / `enum`.  
- Visibility of coverage targets for advanced constructs in coverage-report/v1.  
- Data validity guarantees (e.g. `$defs.uuid` ids never `null` on successful runs).

### 3.3 Property-based / schema‑zoo tests

Location:

- Generator for small schemas: `packages/core/test/property-based/coverage-schema-generator.ts`
- Invariant tests: `packages/core/test/property-based/coverage-off-measure-guided.spec.ts`

Purpose:

- Iterate over a **small schema zoo** generated programmatically and apply
  the same invariants across all of them, e.g.:
  - `coverage=measure` does not change items vs `coverage=off`,
  - `coverage=guided` does not regress vs `coverage=measure` on enabled dimensions.

This is the first step towards a richer property-based testing strategy where
schema families are generated combinatorially from motifs.

---

## 4. Motif Taxonomy

We classify tests around **motifs**, each backed by SPEC anchors:

- Coverage dimensions & target kinds:
  - `SCHEMA_NODE`, `PROPERTY_PRESENT`, `ONEOF_BRANCH`, `ANYOF_BRANCH`,
    `CONDITIONAL_PATH`, `ENUM_VALUE_HIT`, boundaries (M2).
- JSON Schema structural motifs:
  - `oneOf` / `anyOf` / `allOf`, conditionals (`if/then/else`),
    dependencies (`dependentRequired`, `dependentSchemas`),
    AP:false (`additionalProperties:false` + CoverageIndex),
    arrays (`items`, `contains`, `prefixItems`),
    `unevaluatedProperties` / `unevaluatedItems`,
    `patternProperties` + AP:false,
    negative constraints (`not` under `allOf`).
- Coverage modes & CLI behavior:
  - `coverage=off|measure|guided`, `dimensionsEnabled`, `excludeUnreachable`,
    `minCoverage`, `coverage-report/v1` structure.

Each motif is mapped to:

- `SPEC anchors` (section+slug, e.g. `cov://§3#coverage-model`),
- micro‑schemas,
- tests,
- invariants, in `docs/tests-traceability.md`.

---

## 5. Micro‑schemas & “Schema Zoo”

Instead of relying mostly on large “real‑world” schemas, we define a **schema zoo**
of small, targeted schemas:

- Each micro‑schema **isolates une seule idée** (motif):
  - simple `oneOf` with 2 branches,
  - AP:false + patternProperties,
  - array with `contains` and `minContains`,
  - conditional `if/then`,
  - dependentRequired / dependentSchemas, etc.
- Micro‑schemas live inline in tests or in fixtures. Examples:
  - `coverage-branches-enum.test.ts` — generator instrumentation motifs,
  - `analyzer.test.ts` — analyzer motifs (structure, AP:false, branches, boundaries),
  - `coverage-guided-advanced-constructs.spec.ts` — guided behavior on advanced motifs,
  - `order-items-contains-validation.spec.ts` — minimal pipeline validity scenario.

For each new motif introduced in the SPEC, we should:

1. Add or identify an appropriate micro‑schema.  
2. Add analyzer/generator tests to validate instrumentation and targets.  
3. Add e2e tests to validate pipeline + coverage behavior.  
4. Record the mapping in `docs/tests-traceability.md`.

---

## 6. Invariants Catalogue

We focus on **invariants** that should hold across many schemas, not seulement
sur un seul exemple. Key invariants include:

1. **Determinism off vs measure**  
   - For a fixed `(schema, seed, generate.count, validateFormats)`,  
     `coverage=measure` MUST NOT change the final items vs `coverage=off`.  
   - Tested in `coverage-acceptance.spec.ts` and in the property-based loop.

2. **Guided ≥ measure on selected dimensions**  
   - For a fixed budget and `dimensionsEnabled`, `coverage=guided` MUST NOT
     produce lower coverage than `coverage=measure` on `branches` and `enum`
     (and, in some tests, `structure`).  
   - Tested in `coverage-guided-planner.spec.ts`, `coverage-acceptance.spec.ts`,
     and property-based tests.

3. **AP:false invariants**  
   - AP:false objects must use CoverageIndex as source of truth for
     `PROPERTY_PRESENT` on undeclared names; no extra automation.  
   - Keys generated under AP:false must belong to `CoverageIndex`’s universe.  
   - Tested in `analyzer.test.ts` and `pipeline.integration.spec.ts`.

4. **Coverage-report/v1 structure**  
   - `version`, `engine`, `run`, `metrics`, `targets`, `uncoveredTargets`,
     `unsatisfiedHints`, `diagnostics` fields shape and semantics.  
   - Snapshotted in `coverage-report-json.test.ts` and validated via reporter tests.

5. **Data validity invariants**  
   - When a pipeline run completes (`status: 'completed'`), certain fields must
     never be of obviously invalid types (e.g. `$defs.uuid` must never end up as `null`).  
   - Example: `order-items-contains-validation.spec.ts` enforces this for a minimal
     “order + items + contains + uuid” schema.

These invariants should be reused whenever we add new micro‑schemas or property-based
schema generators.

---

## 7. Schema Generation Strategy (Property-based Skeleton)

To reduce the risk of missing combinations, we introduce a small generator for
schemas that exercise coverage-relevant motifs:

- Generator: `packages/core/test/property-based/coverage-schema-generator.ts`
  - Yields `GeneratedSchemaCase { id, kind, schema, dimensions }` for motifs like:
    - `oneOf-enum`,
    - `anyOf-object`,
    - `apfalse-object`,
    - `array-contains`,
    - `conditional-if-then`.

- Invariant test: `packages/core/test/property-based/coverage-off-measure-guided.spec.ts`
  - For each generated schema:
    - Runs `executePipeline` with `coverage=off`, `measure`, `guided`.  
    - Asserts:
      1. `status(off) == status(measure) == status(guided)`  
      2. When `status === 'completed'`, items are equal off vs measure.  
      3. For each enabled dimension, `coverage_guided[dim] >= coverage_measure[dim]`.

This is a **squelette minimal**; it can be extended by:

- Adding more schema kinds (e.g. dependentRequired, unevaluated*, not/allOf).  
- Randomizing some parameters (counts, seeds) within safe bounds.  
- Adding further invariants (diagnostics envelopes, AP:false restrictions, etc.).

---

## 8. Traceability (SPEC ↔ Tests)

Traceability is captured in:

- `docs/tests-traceability.md` — the **matrix** that lists, for each motif:
  - SPEC anchors (`spec://§…#…`, `cov://§…#…`),
  - micro‑schema location,
  - tests,
  - invariants.

Workflow when adding a feature or motif:

1. Identify the SPEC anchors that define the behavior.  
2. Add a micro‑schema (or reuse an existing one).  
3. Add unit tests (generator / analyzer) and e2e tests (pipeline / coverage).  
4. If relevant, add the motif to the property-based generator.  
5. Add/Update the corresponding line in `tests-traceability.md`.

This ensures **SPEC ↔ implementation ↔ tests** stay aligned over time.

---

## 9. Mutation / Regression Testing (Planned)

For critical invariants (determinism off/measure, guided ≥ measure, AP:false
guarantees, diagnostics envelope), we eventually want targeted mutation testing:

- Inject simple synthetic changes (e.g. flip a comparison, drop a coverage event,
  force an id to `null`) behind a controlled flag.  
- Run the test suite and assert that **at least one test fails** for each mutation.

This is not fully implemented yet, but `tests-traceability.md` and this strategy
make it clear **where** mutations should be applied and **which tests** are supposed
to catch them.

---

## 10. Contribution Workflow

When implementing or changing coverage‑aware behavior or advanced JSON Schema
handling, contributors should:

1. Identify relevant SPEC anchors (canonical + coverage-aware).  
2. Check `docs/tests-traceability.md` for existing motifs/tests.  
3. Add or update micro‑schemas and tests in the appropriate layer(s):  
   - generator/analyzer unit tests,  
   - e2e pipeline/coverage tests,  
   - property-based invariants when applicable.  
4. Update `docs/tests-traceability.md` with the new motif/test mapping.  
5. Ensure new behavior respects the invariants catalogue; if a new invariant
   is introduced, document it in section 6 and start using it across the schema zoo.

This keeps the test suite coherent, scalable, and aligned with the SPEC as
coverage-aware capabilities evolve. 

---

## 11. Metrics & Measurement

To avoid “testing by intuition” and track progress, we measure the strategy
along a few axes:

1. **SPEC coverage (qualitative)**  
   - For each priority section/anchor in the SPEC (canonical + coverage-aware),
     we track whether it appears in `docs/tests-traceability.md`.  
   - A simple script can count anchors present in the SPEC vs anchors referenced
     in the matrix (per section), giving a coarse “SPEC→tests coverage” ratio.

2. **Motif coverage (schema zoo & micro-schemas)**  
   - For each motif in the taxonomy (section 4), we track:
     - existence of at least one micro‑schema,  
     - presence of unit tests (generator/analyzer),  
     - presence of e2e tests (pipeline/coverage),  
     - optional presence in the property-based generator.  
   - The matrix acts as the single source of truth for this coverage.

3. **Invariants coverage**  
   - For each invariant in section 6 (determinism off/measure, guided ≥ measure,
     AP:false invariants, coverage-report shape, data validity), we track the
     number of motifs/schemas on which it is exercised.  
   - This can be encoded via comments or tags in `tests-traceability.md`
     and inspected periodically.

4. **Code coverage (implementation-level)**  
   - Standard coverage runs (`vitest --coverage`) on:
     - `packages/core/src/coverage/*`,  
     - `packages/reporter/src/*`.  
   - This does not replace the motif/invariant view, but helps detect dead
     branches in Analyzer/Planner/Runtime/Reporter.

5. **Schema zoo health (property-based loop)**  
   - The property-based test
     `packages/core/test/property-based/coverage-off-measure-guided.spec.ts`
     serves as a health check:  
     - it ensures all generated schemas respect the invariants off/measure/guided,  
     - it can report how many schemas are “degenerate” (e.g. guided == measure)
       vs “effective” (guided improves coverage).  
   - Over time, we can log or export these counts to track regression or
     improvement in guided behavior as the planner evolves.

6. **Mutation testing (future)**  
   - Once the invariants and schema zoo are stable, we can add a small mutation
     harness that toggles simple bugs (dropping events, breaking AP:false
     checks, altering coverage calculations) and counts how many are detected
     by the test suite.  
   - This “kill rate” is the strongest quantitative signal that the test suite
     is sensitive to regressions in critical areas.

These metrics are lightweight by design: they rely on artifacts we already
maintain (SPEC anchors, test files, the schema zoo) and do not block the
regular development workflow, while still giving us a way to reason about
how far our tests cover the intended behavior. 
