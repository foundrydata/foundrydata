# Traceability — Task 9310 (Implement OpenAPI per-operation coverage and byOperation metrics (M2))

This document maps parent task 9310 bullets from Implementation Details, Deliverables, Definition of Done and Test Strategy to subtasks 9310.9310001–9310.9310004.

## Parent bullets

### Implementation Details

- [KR1] Extend CoverageAnalyzer with an OpenAPI-aware layer to build OperationNode entries and attach schema nodes for request and response payloads, with operationKey defined as operationId or `<METHOD> <path>` when operationId is absent, building on the schema-level CoverageGraph from task 9301 without changing existing target IDs.
- [KR2] Treat operation-level targets (OP_REQUEST_COVERED, OP_RESPONSE_COVERED, SCHEMA_REUSED_COVERED) as belonging to the `operations` coverage dimension and only materialize them when `operations` is present in `run.dimensionsEnabled`, while still allowing internal operation mappings to exist when the dimension is disabled.
- [KR3] Implement OP_REQUEST_COVERED and OP_RESPONSE_COVERED targets per operationKey in the `operations` coverage dimension and map schema-level targets (structure, branches, enum, boundaries) reachable from each operation to that operation for coverage.byOperation computation.
- [KR4] Implement SCHEMA_REUSED_COVERED as a diagnostic-only target kind for canonical schemas reused across multiple operations, emitted with `status:'deprecated'` and visible in targets/uncoveredTargets and diagnostics but excluded from `metrics.overall`, `metrics.byDimension`, `metrics.byOperation` and `minCoverage`.
- [KR5] Implement deterministic request/response schema selection for JSON media types (lexicographic media type ordering, preference for 200 and 2xx JSON responses) in line with the spec.
- [KR6] Populate `run.operationsScope` and `run.selectedOperations` in the coverage report when only a subset of operations is targeted, ensuring that only in-scope operations contribute to `coverage.byOperation` and `activeTargetsTotal`, and that metrics.byOperation and selectedOperations are always interpreted within the declared operationsScope.
- [KR7] Integrate coverage.byOperation into CLI summary output (task 9304), highlighting least-covered operations in a deterministic order.

### Deliverables

- [DEL1] Operation-aware target generation in CoverageAnalyzer under `packages/core/src/coverage/coverage-analyzer-openapi.ts`.
- [DEL2] Mapping logic from schema targets to operations for coverage.byOperation metrics in CoverageEvaluator.
- [DEL3] CLI support for operation selection flags (if not already present) that set `operationsScope` and `selectedOperations` in the coverage report.

### Definition of Done

- [DOD1] For an OpenAPI fixture with multiple operations (with and without operationId), coverage reports include `coverage.byOperation[operationKey]` entries with expected ratios.
- [DOD2] OP_REQUEST_COVERED and OP_RESPONSE_COVERED targets behave as specified, and schema-level targets reachable from each operation are correctly attributed without changing schema-level IDs defined by task 9301.
- [DOD3] SCHEMA_REUSED_COVERED targets are emitted for schemas reused in more than one operation, are hit when those schemas are instantiated at least once, and remain clearly diagnostic-only so that metrics and thresholds are unaffected (via `status:'deprecated'` in the `operations` dimension).
- [DOD4] `operationsScope` and `selectedOperations` fields behave as specified when running against a subset of operations, and toggling them never changes schema-level `CoverageTarget.id` values.
- [DOD5] CLI summary shows per-operation coverage and highlights the least-covered operations in a deterministic order.

### Test Strategy

- [TS1] Unit tests for operation selection and OperationNode construction using small OpenAPI specs with multiple operations and content types.
- [TS2] Evaluator tests for `coverage.byOperation` mapping and ratios that honor `dimensionsEnabled`, including cases where the `operations` dimension is enabled and disabled.
- [TS3] Tests confirming SCHEMA_REUSED_COVERED targets are emitted with `status:'deprecated'`, remain visible in targets/uncoveredTargets and diagnostics, and do not affect `metrics.overall`, `metrics.byDimension`, `metrics.byOperation` or `minCoverage`.
- [TS4] Tests that run coverage on an OpenAPI fixture with `operations` present and absent in `dimensionsEnabled` and assert that schema-level `CoverageTarget.id` values remain unchanged while OP_* targets are only present and counted when `operations` is enabled.
- [TS5] CLI integration tests that generate coverage for selected operations and assert `operationsScope`, `selectedOperations` and `byOperation` metrics in the JSON report and summary output.

## Mapping 9310 subtasks → parent bullets

- **9310.9310001 – Build OperationNode mapping and operationKey derivation**  
  Covers: [KR1], [DEL1], [DOD1], [TS1] (extends CoverageAnalyzer with OpenAPI-specific logic to construct OperationNodes and derive operationKey from operationId or HTTP method and path, preparing the operation-aware layer without changing existing schema-level target IDs).

- **9310.9310002 – Implement OP_REQUEST_COVERED, OP_RESPONSE_COVERED and SCHEMA_REUSED_COVERED targets**  
  Covers: [KR2], [KR3], [KR4], [DEL1], [DEL2], [DOD2], [DOD3], [TS1], [TS2], [TS3] (adds `operations`-dimension targets for request/response coverage and schema reuse on top of the OperationNode graph and ensures SCHEMA_REUSED_COVERED remains strictly diagnostic-only while preserving schema-level target IDs).

- **9310.9310003 – Map schema targets to operations for coverage.byOperation**  
  Covers: [KR3], [KR6], [DEL2], [DOD1], [DOD4], [TS2], [TS4] (implements mapping from schema-level targets to operations, computes `coverage.byOperation` metrics within an explicit operationsScope and ensures that enabling or disabling operations-level reporting never mutates schema-level IDs).

- **9310.9310004 – Add tests and fixtures for OpenAPI coverage behavior**  
  Covers: [DEL3], [DOD1], [DOD2], [DOD3], [DOD5], [TS1], [TS2], [TS3], [TS4], [TS5] (adds focused fixtures and end-to-end tests for OpenAPI coverage, including operations dimension toggles, SCHEMA_REUSED_COVERED semantics and CLI summary output for least-covered operations).

Status:

- 9310.9310001: done
- 9310.9310002: in-progress
- 9310.9310003: pending
- 9310.9310004: pending
