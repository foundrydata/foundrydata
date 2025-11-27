# Task ID: 9300

**Title:** Define coverage core types and ID semantics

**Status:** in-progress

**Dependencies:** None

**Priority:** high

**Description:** Introduce CoverageTarget, CoverageGraph and related types with deterministic, stable IDs for coverage-aware runs.

**Details:**

[Context]
Define the core coverage model for FoundryData, including CoverageTarget, CoverageTargetReport and CoverageGraph nodes and dimensions. Align with the coverage-aware spec §3 (Coverage model) and §3.2 (CoverageTargets), and ensure IDs are stable across runs and independent of dimensionsEnabled.

[Key requirements]
- Design CoverageTarget, CoverageTargetReport and CoverageGraph types that can represent structure, branches, enum values, boundaries and operation-linked nodes.
- Introduce a canonical CoverageDimension union used consistently in core and shared packages: type CoverageDimension = 'structure' | 'branches' | 'enum' | 'boundaries' | 'operations'; and reuse it for CoverageTarget.dimension, run.dimensionsEnabled and metrics.byDimension keys.
- Define a deterministic, canonical ID scheme for CoverageTarget.id that only depends on canonical schema, optional OpenAPI mapping, FoundryData major version and coverage-report format major; IDs MUST NOT depend on dimensionsEnabled or runtime coverage options.
- Represent dimensions (structure, branches, enum, boundaries, operations) and statuses ('active', 'unreachable' and 'deprecated'), plus inert fields weight and polarity.
- Support diagnostic-only target kinds such as SCHEMA_REUSED_COVERED by always emitting them with status:'deprecated' so they remain visible in targets[] and diagnostics but never contribute to metrics.overall, metrics.byDimension, metrics.byOperation or minCoverage enforcement.
- Ensure the CoverageGraph can be derived from Normalize/Compose canonical artifacts without reparsing the raw schema or re-implementing JSON Schema semantics.
- Provide basic helpers for mapping canonical JSON Pointers and operation keys (operationId or <METHOD> <path>) to coverage nodes, without forcing OpenAPI operation-level logic into the core analyzer before task 9310.

[Deliverables]
- Core coverage model types under packages/core/src/coverage/model.ts.
- Utility functions for CoverageGraph construction hooks under packages/core/src/coverage/graph.ts.
- Shared type exports in packages/shared/src/types/coverage.ts for CLI and reporter consumers.

[Definition of Done]
- CoverageTarget, CoverageTargetReport, CoverageGraph and CoverageDimension types are defined and exported from core and shared packages.
- The ID generation scheme is documented and deterministic in unit tests: the same canonical schema and OpenAPI mapping produce the same IDs, and changing dimensionsEnabled does not change IDs for any target that exists under both projections.
- The model supports all dimensions defined in the spec, including future boundaries and operation-linked kinds, and can represent diagnostic-only targets such as SCHEMA_REUSED_COVERED while keeping their status:'deprecated' semantics aligned with metrics exclusions.
- No new model type requires reparsing user schemas; everything is expressed in terms of canonical schema pointers and Compose artifacts.
- Basic unit tests for the ID generator and CoverageGraph helpers are green and integrated in CI.

**Test Strategy:**

Unit tests for ID determinism and stability across runs with fixed canonical schemas; property-based tests that hash canonical views and check CoverageTarget.id stability when dimensionsEnabled is toggled; type-level tests to ensure dimensions, statuses and diagnostic kinds like SCHEMA_REUSED_COVERED match the spec; review of public exports to avoid breaking shared consumers; property-based tests that build Analyzer output twice for the same canonical schema with different dimensionsEnabled projections (e.g. ['structure','branches'] vs ['structure','branches','enum']) and assert that IDs and shapes of non-enum targets remain identical after sorting by id.

## Subtasks

### 9300.9300001. Design CoverageTarget and CoverageGraph types

**Status:** pending  
**Dependencies:** None  

Sketch and implement CoverageTarget, CoverageTargetReport and CoverageGraph interfaces, including dimensions, status, weight, polarity and meta fields. Define branch target kinds ONEOF_BRANCH, ANYOF_BRANCH and CONDITIONAL_PATH (for if/then/else and dependentSchemas paths) and a params shape that records pathKind and branchKey without depending on dimensionsEnabled.

### 9300.9300002. Implement deterministic CoverageTarget ID generator

**Status:** pending  
**Dependencies:** None  

Implement a stable ID generator for coverage targets based on canonical paths, kind, dimension and optional operationKey and params, independent of dimensionsEnabled. IDs MUST NOT depend on status, hit, weight, polarity, meta, dimensionsEnabled, excludeUnreachable, planner caps, hints or any runtime coverage results.

### 9300.9300003. Expose coverage types in shared package

**Status:** pending  
**Dependencies:** None  

Re-export coverage types in the shared package for consumption by CLI and reporter.

### 9300.9300004. Add unit tests for ID stability and dimensions

**Status:** pending  
**Dependencies:** None  

Add tests that assert IDs are stable when dimensionsEnabled, excludeUnreachable or planner/cap options change, including a projection test where the same canonical schema is analyzed with different dimensionsEnabled sets (e.g. ['structure','branches'] vs ['structure','branches','enum']) and non-enum CoverageTarget.id values remain identical.
