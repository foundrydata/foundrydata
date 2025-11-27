# Task ID: 9310

**Title:** Implement OpenAPI per-operation coverage and byOperation metrics (M2)

**Status:** pending

**Dependencies:** 9301, 9302, 9303, 9305

**Priority:** medium

**Description:** Track coverage per OpenAPI operation, including OP_REQUEST_COVERED, OP_RESPONSE_COVERED, SCHEMA_REUSED_COVERED and coverage.byOperation ratios.

**Details:**

[Context]
Extend coverage-aware behavior to OpenAPI operations for M2, per §3.3 (Inter-schema / API coverage), §3.5 (Metrics & semantics) and §9 (M2 – Boundaries, OpenAPI & diff). The system must compute per-operation coverage metrics and define OP_REQUEST_COVERED, OP_RESPONSE_COVERED and SCHEMA_REUSED_COVERED targets based on deterministic schema selection rules.

[Key requirements]
- Extend CoverageAnalyzer with an OpenAPI-aware layer to build OperationNode entries and attach schema nodes for request and response payloads, with operationKey defined as operationId or <METHOD> <path> when operationId is absent. This layer builds on the schema-level CoverageGraph produced by task 9301 without changing existing target IDs.
- Treat operation-level targets (OP_REQUEST_COVERED, OP_RESPONSE_COVERED, SCHEMA_REUSED_COVERED) as belonging to the 'operations' coverage dimension and only materialize them when 'operations' is present in run.dimensionsEnabled; when 'operations' is absent, the analyzer may still build internal operation mappings but MUST NOT emit operation-level CoverageTargets in targets[] for standard modes.
- Implement OP_REQUEST_COVERED and OP_RESPONSE_COVERED targets per operationKey in the 'operations' coverage dimension and map schema-level targets (structure, branches, enum, boundaries) reachable from each operation to that operation for coverage.byOperation computation.
- Implement SCHEMA_REUSED_COVERED as a diagnostic-only target kind for canonical schemas reused across multiple operations; these targets must be emitted and visible in targets/uncoveredTargets and diagnostics with status:'deprecated' but excluded from metrics.overall, metrics.byDimension, metrics.byOperation and minCoverage.
- Implement deterministic request/response schema selection for JSON media types in line with the spec (lexicographic media type order, preference for 200 and 2xx JSON responses).
- Populate run.operationsScope and run.selectedOperations in the coverage report when only a subset of operations is targeted, and ensure only in-scope operations contribute to coverage.byOperation and activeTargetsTotal; metrics.byOperation and selectedOperations must always be interpreted within the declared operationsScope.
- Integrate coverage.byOperation into CLI summary output (task 9304), highlighting least-covered operations in a deterministic order.

[Deliverables]
- Operation-aware target generation in CoverageAnalyzer under packages/core/src/coverage/coverage-analyzer-openapi.ts.
- Mapping logic from schema targets to operations for coverage.byOperation metrics in CoverageEvaluator.
- CLI support for operation selection flags (if not already present) that set operationsScope and selectedOperations in the report.

[Definition of Done]
- For an OpenAPI fixture with multiple operations (with and without operationId), coverage reports include coverage.byOperation[operationKey] entries with expected ratios.
- OP_REQUEST_COVERED and OP_RESPONSE_COVERED targets behave as specified, and schema-level targets reachable from each operation are correctly attributed without changing schema-level IDs defined by 9301.
- SCHEMA_REUSED_COVERED targets are emitted for schemas used in more than one operation, are hit when those schemas are instantiated at least once, and are clearly diagnostic-only so that metrics and thresholds are unaffected via status:'deprecated' in the 'operations' dimension.
- operationsScope and selectedOperations fields behave as specified when running against a subset of operations, and toggling operationsScope or selectedOperations never changes schema-level CoverageTarget.id values.
- CLI summary shows per-operation coverage and highlights the least-covered operations in a deterministic order.

**Test Strategy:**

Unit tests for operation selection and target construction using small OpenAPI specs with multiple operations and content types; evaluator tests for coverage.byOperation mapping and ratios honoring dimensionsEnabled; tests confirming SCHEMA_REUSED_COVERED targets are emitted with status:'deprecated', remain visible in targets/uncoveredTargets and do not affect metrics.overall, metrics.byDimension or metrics.byOperation; tests that run coverage on an OpenAPI fixture with 'operations' present and absent in dimensionsEnabled and assert that schema-level CoverageTarget.id values remain unchanged while OP_* targets are only present and counted when 'operations' is enabled; CLI integration tests that generate coverage for selected operations and assert operationsScope, selectedOperations and byOperation metrics in the JSON report and summary output.

## Subtasks

### 9310.9310001. Build OperationNode mapping and operationKey derivation

**Status:** pending  
**Dependencies:** None  

Extend CoverageAnalyzer with OpenAPI-specific logic to create OperationNodes and derive operationKey from operationId or HTTP method and path.

### 9310.9310002. Implement OP_REQUEST_COVERED, OP_RESPONSE_COVERED and SCHEMA_REUSED_COVERED targets

**Status:** pending  
**Dependencies:** None  

Create operation-level coverage targets for request and response schemas and diagnostic-only SCHEMA_REUSED_COVERED targets for schemas reused across operations, and mark hits when at least one payload is generated.

### 9310.9310003. Map schema targets to operations for coverage.byOperation

**Status:** pending  
**Dependencies:** None  

Implement deterministic mapping from schema-level targets to operation keys and compute coverage.byOperation ratios, without changing schema-level CoverageTarget.id values.

### 9310.9310004. Add tests and fixtures for OpenAPI coverage behavior

**Status:** pending  
**Dependencies:** None  

Write tests on OpenAPI fixtures that validate per-operation metrics, operationKey shapes, operationsScope semantics and SCHEMA_REUSED_COVERED diagnostics.
