# Task ID: 9309

**Title:** Add boundaries coverage dimension and instrumentation (M2)

**Status:** pending

**Dependencies:** 9300 ⧖, 9301, 9302, 9307

**Priority:** medium

**Description:** Extend coverage model, analyzer and instrumentation to track hits for numeric, string and array boundary constraints.

**Details:**

[Context]
Implement the boundaries dimension for M2, covering numeric, string and array bounds as described in §3.3 (Boundaries) and §9 (M2 – Boundaries, OpenAPI & diff). This includes NUMERIC_MIN_HIT, NUMERIC_MAX_HIT, STRING_MIN_LENGTH_HIT, STRING_MAX_LENGTH_HIT, ARRAY_MIN_ITEMS_HIT and ARRAY_MAX_ITEMS_HIT targets and their hit semantics.

[Key requirements]
- Extend CoverageTarget model and CoverageAnalyzer to identify constraint nodes for numeric, string and array boundaries in the canonical view, and materialize corresponding boundary coverage targets when the dimension is enabled.
- Implement hit semantics for inclusive and exclusive numeric bounds, including representative values based on existing numeric planning and multipleOf handling; avoid introducing separate numeric optimality logic in the coverage layer.
- Handle degenerate cases where min==max (or similar for lengths and items) deterministically, either as a single logical boundary or as two co-hit targets.
- Use existing UNSAT diagnostics and numeric feasibility checks to avoid marking unreachable boundary values as active; unreachable boundaries should be either omitted or flagged status:'unreachable'.
- Instrument generator and repair to emit boundary coverage events in streaming mode without adding new passes over the data.

[Deliverables]
- Boundaries dimension extensions in coverage model and analyzer under packages/core/src/coverage/model.ts and coverage-analyzer.ts.
- Boundary-specific instrumentation in generator and repair to record hits when boundary representatives are emitted.
- Tests and fixtures for numeric bounds with multipleOf, string length and array length constraints, including unreachable cases.

[Commands]
- npm run build
- npm run test -- --runInBand
- npm run test packages/core/src/coverage/__tests__/boundaries.spec.ts

[Definition of Done]
- When boundaries dimension is enabled, reports contain boundary targets and coverage.byDimension['boundaries'] metrics consistent with hand-calculated expectations on fixtures.
- Boundary targets respect reachability rules and do not stay active for values proven to be outside the admissible domain.
- generator and repair instrumentation uses existing numeric planning rules to choose representative values and does not require special-case numeric logic in the coverage layer.
- Performance remains acceptable when boundaries are enabled; tests measure the added overhead and ensure it remains bounded.

**Test Strategy:**

Unit tests for boundary target discovery in CoverageAnalyzer; generator-focused tests that emit values exactly at or around bounds and assert boundary hit flags; tests that combine boundaries with multipleOf and verify unreachable cases are marked correctly; integration tests with coverage=guided where boundaries dimension is enabled and coverage.byDimension['boundaries'] behaves as expected.

## Subtasks

### 9309.9309001. Extend coverage model and analyzer for boundaries dimension

**Status:** pending  
**Dependencies:** None  

Add boundaries dimension kinds and discover boundary constraints in canonical schemas to create coverage targets.

### 9309.9309002. Instrument generator for numeric and length boundary hits

**Status:** pending  
**Dependencies:** None  

Emit coverage events when numeric values, string lengths and array lengths hit boundary representatives.

### 9309.9309003. Handle unreachable or degenerate boundary targets

**Status:** pending  
**Dependencies:** None  

Use existing UNSAT diagnostics and numeric feasibility checks to mark unreachable boundaries appropriately.

### 9309.9309004. Add tests for boundary coverage semantics

**Status:** pending  
**Dependencies:** None  

Create fixtures and tests that validate inclusive vs exclusive, min==max and multipleOf interactions for boundary coverage, including cases where a boundary-hitting value that passes AJV remains unchanged by Repair unless another constraint requires a different value so boundary hits are not lost unnecessarily.
