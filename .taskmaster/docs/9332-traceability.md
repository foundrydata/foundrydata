# Traceability — Task 9332 (Refine boundaries and operations coverage model)

This document maps the parent task 9332 bullets from Implementation Details, Deliverables, Definition of Done and Test Strategy to its subtasks 9332.9332001–9332.9332003.

## Parent bullets

### Implementation Details

- [KR1] Precisely define which combinations of `minimum`/`maximum`/`exclusiveMinimum`/`exclusiveMaximum`, `minLength`/`maxLength` and `minItems`/`maxItems` map to `NUMERIC_*`, `STRING_*` and `ARRAY_*` boundary targets, with deterministic IDs and bounded volumetry.
- [KR2] Ensure operations coverage (OperationNode graph, OP_* targets, SCHEMA_REUSED_COVERED) reflects realistic OpenAPI patterns (multi-response, components refs, request-only/response-only operations) while keeping SCHEMA_REUSED_COVERED purely diagnostic (`status:'deprecated'`).
- [KR3] Guarantee that enabling/disabling boundaries or operations in `dimensionsEnabled` does not change IDs or shapes for non-boundaries / non-operations targets; ID stability must hold across projections.

### Deliverables

- [DEL1] Refined boundaries target creation logic and tests under `packages/core/src/coverage/analyzer.ts` and `packages/core/src/coverage/__tests__/boundaries.spec.ts` (or equivalent analyzer tests).
- [DEL2] Hardened operations coverage behavior and diagnostics in `coverage-analyzer-openapi` and associated tests.
- [DEL3] Additional diff and evaluator tests exercising ID stability and metrics behavior when boundaries/operations dimensions are toggled.

### Definition of Done

- [DOD1] For numeric/string/array constraints, boundary targets (`NUMERIC_MIN_HIT`, `NUMERIC_MAX_HIT`, `STRING_MIN_LENGTH_HIT`, `STRING_MAX_LENGTH_HIT`, `ARRAY_MIN_ITEMS_HIT`, `ARRAY_MAX_ITEMS_HIT`) are materialised exactly as specified for all combinations of inclusive/exclusive bounds, including degenerate cases (e.g., `min == max`) with clear semantics and no unbounded explosion in target count.
- [DOD2] Operations targets and SCHEMA_REUSED_COVERED behavior are aligned with the coverage-aware spec: operations dimension only when enabled, SCHEMA_REUSED_COVERED always diagnostic-only and excluded from metrics denominators.
- [DOD3] Diff and evaluator tests confirm that toggling boundaries/operations dimensions leaves IDs and statuses of other dimensions untouched while metrics remain consistent with the filtered dimensions.

### Test Strategy

- [TS1] Analyzer and boundaries-focused unit tests that feed synthetic schemas with various boundary combinations and assert the exact set of boundary targets and params produced.
- [TS2] OpenAPI analyzer tests that exercise multiple responses, shared components and SCHEMA_REUSED_COVERED, and verify operations targets and diagnostics.
- [TS3] Diff/evaluator tests that compare runs with and without boundaries/operations enabled, checking ID stability and metrics / diff outputs for non-boundaries/non-operations targets.

## Mapping 9332 subtasks → parent bullets

- **9332.9332001 – Clarify boundaries target semantics and tests**  
  Covers: [KR1], [DEL1], [DOD1], [TS1].

- **9332.9332002 – Harden operations dimension and SCHEMA_REUSED_COVERED behavior**  
  Covers: [KR2], [DEL2], [DOD2], [TS2].

- **9332.9332003 – Validate ID stability and diff for boundaries/operations**  
  Covers: [KR3], [DEL3], [DOD3], [TS3].
