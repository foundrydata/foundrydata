# Task ID: 9312

**Title:** Validate coverage invariants, determinism and acceptance scenarios

**Status:** pending

**Dependencies:** 9302, 9303, 9304, 9305, 9306, 9307, 9308, 9309, 9310

**Priority:** medium

**Description:** Add cross-cutting tests and documentation that ensure coverage-aware behavior respects core invariants and satisfies all acceptance criteria.

**Details:**

[Context]
Consolidate cross-cutting coverage tests and docs to ensure the coverage layer respects the core pipeline invariants and satisfies the acceptance criteria listed in §10 (Acceptance criteria) and constraints in §8 (Technical constraints & invariants). This includes determinism, AJV-as-oracle behavior, no network I/O in coverage stages and compatibility with CoverageIndex under AP:false.

[Key requirements]
- Add end-to-end tests for each acceptance scenario: oneOf branches, optional properties, enums, coverage threshold, OpenAPI coverage and reproducibility of coverage reports for identical inputs.
- Verify that coverage-aware pipeline runs preserve AJV-as-oracle behavior: final validation still uses the original schema and coverage logic never re-parses or re-interprets JSON Schema semantics independently.
- Confirm deterministic behavior: for fixed (canonical schema, OpenAPI spec, coverage options, seed, AJV major, registryFingerprint), CoverageGraph, TestUnits, generated instances and coverage reports are identical across runs.
- Ensure coverage stages do not introduce network I/O and remain compatible with existing external $ref resolver behavior and CoverageIndex invariants under AP:false.
- Document coverage invariants and known limitations in docs to align with existing architecture and known-limits documents.

[Deliverables]
- Acceptance-focused e2e test suite in packages/core/test/e2e/coverage-acceptance.spec.ts.
- Determinism tests and tooling to compare coverage reports across multiple runs.
- Documentation updates in docs/spec-coverage-aware-v1.x and high-level README/Architecture notes.

[Commands]
- npm run build
- npm run test -- --runInBand
- npm run test packages/core/test/e2e/coverage-acceptance.spec.ts

[Definition of Done]
- All acceptance scenarios from the spec are covered by automated tests that assert expected coverage metrics, exit codes and report content.
- Reproducibility tests confirm that repeated runs produce byte-identical coverage reports except for allowed timestamp fields.
- Additional tests confirm there is no network I/O in coverage stages and that CoverageIndex semantics under AP:false are preserved.
- Documentation for coverage invariants, determinism and limitations is merged and aligned with existing architecture and invariants docs.

**Test Strategy:**

End-to-end Vitest suites exercising coverage-aware runs over small JSON Schema and OpenAPI fixtures, asserting each acceptance criterion; determinism tests that run the same configuration multiple times and compare normalized coverage reports; tests that instrument or mock network layers to ensure coverage stages remain I/O-free; manual and code-reviewed documentation updates that describe coverage invariants and how they relate to the existing core pipeline contracts, including status:'deprecated' semantics for diagnostic-only targets such as SCHEMA_REUSED_COVERED and the use of status:'unreachable' (rather than a dedicated unreachableTargets array) to represent unreachable targets in coverage-report/v1.

## Subtasks

### 9312.9312001. Implement acceptance tests for oneOf, optional properties and enums

**Status:** pending  
**Dependencies:** None  

Add e2e tests that validate oneOf branch coverage, PROPERTY_PRESENT behavior and enum coverage under measure and guided modes.

### 9312.9312002. Add tests for minCoverage and coverage threshold behavior

**Status:** pending  
**Dependencies:** None  

Create tests that assert coverageStatus, CLI exit codes and summary output when minCoverage is not met.

### 9312.9312003. Add OpenAPI coverage and reproducibility tests

**Status:** pending  
**Dependencies:** None  

Add e2e tests that validate coverage.byOperation, OP_* targets and reproducibility of coverage reports across identical runs.

### 9312.9312004. Document coverage invariants and limitations

**Status:** pending  
**Dependencies:** None  

Update architecture and invariants docs to describe coverage-specific constraints and how they compose with existing pipeline guarantees. Document that diagnostic-only targets such as SCHEMA_REUSED_COVERED are emitted with status:'deprecated' so they are excluded from all coverage denominators while remaining visible in reports, and that unreachable targets are identified by status:'unreachable' in CoverageTargetReport entries with no separate unreachableTargets array in coverage-report/v1; consumers must derive unreachable views by filtering on status.
