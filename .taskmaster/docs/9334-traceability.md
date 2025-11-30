# Traceability — Task 9334 (Define coverage-report/v1 JSON schema and compatibility guards)

This document maps the parent task 9334 bullets from Implementation Details, Deliverables, Definition of Done and Test Strategy to its subtasks 9334.9334001–9334.9334003.

## Parent bullets

### Implementation Details

- [KR1] Define a JSON Schema for coverage-report/v1 that matches the shared CoverageReport types and the coverage-aware spec (engine/run headers, metrics, targets, uncoveredTargets, unsatisfiedHints, diagnostics).
- [KR2] Validate generated coverage reports against this schema in tests (and optionally via a debug-only assertion path) to catch regressions early.
- [KR3] Ensure coverage diff and compatibility checks remain stable across report evolutions, including older reports and newly added fields/dimensions.

### Deliverables

- [DEL1] coverage-report/v1 JSON Schema file checked into the repo (docs or reporter package).
- [DEL2] Reporter/core tests that validate sample coverage-report/v1 instances against the schema.
- [DEL3] Extended diff tests for compatibility between baseline and newer coverage-report/v1 files.

### Definition of Done

- [DOD1] The coverage-report/v1 JSON Schema accurately captures required fields, optional fields and value constraints for the CoverageReport contract and matches the spec narrative.
- [DOD2] All tests that generate coverage-report/v1 validate the JSON output against this schema (or a representative subset of fixtures) and fail on incompatible changes.
- [DOD3] Compatibility tests demonstrate that older reports remain acceptable and that new fields are surfaced in a backward-compatible way, with explicit compatibility diagnostics where needed.

### Test Strategy

- [TS1] Schema-focused tests that load the coverage-report/v1 JSON Schema and assert that current CoverageReport fixtures validate successfully.
- [TS2] Core/reporting tests that ensure invalid or incomplete coverage reports are rejected by the schema in a way that matches the spec’s required fields.
- [TS3] Diff compatibility tests that exercise comparisons between reports from different stages (baseline vs extended) and verify stable behavior and diagnostics.

## Mapping 9334 subtasks → parent bullets

- **9334.9334001 – Define coverage-report/v1 JSON Schema**  
  Covers: [KR1], [DEL1], [DOD1], [TS1] (status: covered).

- **9334.9334002 – Validate generated reports against the schema in tests**  
  Covers: [KR2], [DEL2], [DOD2], [TS2] (status: covered).

- **9334.9334003 – Extend coverage diff compatibility tests**  
  Covers: [KR3], [DEL3], [DOD3], [TS3] (status: covered).
