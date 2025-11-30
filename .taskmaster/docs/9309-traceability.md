# Traceability — Task 9309 (Add boundaries coverage dimension and instrumentation (M2))

This document maps parent task 9309 bullets from Implementation Details, Deliverables, Definition of Done and Test Strategy to subtasks 9309.9309001–9309.9309004.

## Parent bullets

### Implementation Details

- [KR1] Implement the `boundaries` coverage dimension for numeric, string and array bounds as described in §3.3 and §9, including `NUMERIC_MIN_HIT`, `NUMERIC_MAX_HIT`, `STRING_MIN_LENGTH_HIT`, `STRING_MAX_LENGTH_HIT`, `ARRAY_MIN_ITEMS_HIT` and `ARRAY_MAX_ITEMS_HIT` targets.
- [KR2] Align boundary hit semantics for inclusive and exclusive numeric bounds with existing numeric planning and `multipleOf` handling, without introducing separate optimality logic in the coverage layer.
- [KR3] Handle degenerate cases where `min == max` (and the analogous cases for lengths/items) deterministically, either as a single logical boundary or as two co-hit targets, keeping the chosen strategy stable for a given canonical schema.
- [KR4] Use existing UNSAT diagnostics and numeric feasibility checks from Normalize/Compose (including `UNSAT_NUMERIC_BOUNDS` and related guards) so unreachable boundary values are either omitted from the target universe or marked with `status:'unreachable'`, never left active.
- [KR5] Instrument generator and Repair to emit boundary coverage events in streaming mode, relying on existing data paths and avoiding new full passes over emitted instances.

### Deliverables

- [DEL1] Boundaries dimension extensions in the coverage model and analyzer under `packages/core/src/coverage` so that canonical schemas with numeric, string and array bounds materialize the corresponding boundary targets when the dimension is enabled.
- [DEL2] Boundary-specific instrumentation in generator and Repair so that boundary representatives emit coverage events compatible with the streaming accumulator and CoverageGraph.
- [DEL3] Tests and fixtures for numeric bounds with `multipleOf`, string length and array length constraints, including cases where domains are empty or certain boundaries are unreachable.

### Definition of Done

- [DOD1] With `dimensionsEnabled` containing `'boundaries'`, coverage reports include boundary targets, and `coverage.byDimension['boundaries']` metrics match hand-calculated expectations on representative fixtures.
- [DOD2] Boundary targets respect reachability rules derived from existing diagnostics and feasibility checks; targets for provably unreachable boundary values are not left as `status:'active'`.
- [DOD3] Generator and Repair instrumentation reuse existing numeric planning rules (including `multipleOf` handling) to choose boundary representatives, without adding ad-hoc numeric logic in the coverage layer.
- [DOD4] Enabling the boundaries dimension keeps performance within acceptable limits; tests measure the added overhead and ensure it remains bounded.

### Test Strategy

- [TS1] Unit tests for boundary target discovery in `CoverageAnalyzer`, including numeric, string and array constraints in the canonical view.
- [TS2] Generator-focused tests that emit values exactly at or around bounds (including exclusive cases) and assert that the expected boundary targets are marked as hit.
- [TS3] Tests that combine numeric bounds with `multipleOf` and other feasibility constraints, verifying that unreachable boundaries are marked correctly (or omitted) while reachable domains remain covered.
- [TS4] Integration tests with `coverage=guided` where the `boundaries` dimension is enabled and `coverage.byDimension['boundaries']` behaves as expected across OpenAPI-linked scenarios.

## Mapping 9309 subtasks → parent bullets

- **9309.9309001 – Extend coverage model and analyzer for boundaries dimension**  
  Covers: [KR1], [DEL1], [DOD1], [TS1] (adds boundary target kinds for numeric, string and array constraints in the coverage model and extends the analyzer so canonical schemas materialize `boundaries` targets when the dimension is enabled, without changing behavior of existing dimensions).

- **9309.9309002 – Instrument generator for numeric and length boundary hits**  
  Covers: [KR2], [KR3], [KR5], [DEL2], [DOD3], [TS2] (emits streaming coverage events whenever the generator hits inclusive or exclusive numeric bounds or length/item boundaries, aligning hit semantics with existing numeric planning and preparing the path for Repair to reuse the same event model in a later subtask without adding new passes over emitted instances).

- **9309.9309003 – Handle unreachable or degenerate boundary targets**  
  Covers: [KR4], [DEL3], [DOD2], [TS3] (uses UNSAT diagnostics and numeric feasibility checks to mark unreachable boundary targets with `status:'unreachable'` or omit them, including numeric bounds constrained by `multipleOf`, while keeping reachable domains active).

- **9309.9309004 – Add tests for boundary coverage semantics**  
  Covers: [DEL3], [DOD1], [DOD4], [TS2], [TS4] (adds focused fixtures and end-to-end tests that validate boundary metrics in `coverage.byDimension['boundaries']`, confirm that boundary hits survive Repair and guided modes, and measure performance overhead when the dimension is enabled).

Status:

- 9309.9309001: done
- 9309.9309002: in-progress
- 9309.9309003: pending
- 9309.9309004: pending
