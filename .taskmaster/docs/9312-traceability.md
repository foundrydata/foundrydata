# 9312 Traceability

## Implementation Details
- [CTX1] Cross-cutting coverage tests and docs ensure the coverage layer respects pipeline invariants and the acceptance criteria from §10, including determinism, AJV-as-oracle behavior, no network I/O in coverage stages and compatibility with CoverageIndex under AP:false.

## Key requirements
- [KR1] Add end-to-end tests for each acceptance scenario: oneOf branches, optional properties, enums, coverage threshold, OpenAPI coverage and reproducibility of coverage reports for identical inputs.
- [KR2] Verify that coverage-aware pipeline runs preserve AJV-as-oracle behavior: final validation still uses the original schema and coverage logic never re-parses or re-interprets JSON Schema semantics independently.
- [KR3] Confirm deterministic behavior: for fixed (canonical schema, OpenAPI spec, coverage options, seed, AJV major, registryFingerprint), CoverageGraph, TestUnits, generated instances and coverage reports are identical across runs.
- [KR4] Ensure coverage stages do not introduce network I/O and remain compatible with existing external $ref resolver behavior and CoverageIndex invariants under AP:false.
- [KR5] Document coverage invariants and known limitations in docs, aligned with existing architecture and known-limits documents.

## Deliverables
- [DEL1] Acceptance-focused e2e test suite in `packages/core/test/e2e/coverage-acceptance.spec.ts`.
- [DEL2] Determinism tests and tooling to compare coverage reports across multiple runs.
- [DEL3] Documentation updates in `docs/spec-coverage-aware-v1.x` and high-level README/Architecture notes.

## Definition of Done
- [DOD1] All acceptance scenarios from the spec are covered by automated tests that assert expected coverage metrics, exit codes and report content.
- [DOD2] Reproducibility tests confirm that repeated runs produce byte-identical coverage reports except for allowed timestamp fields.
- [DOD3] Additional tests confirm there is no network I/O in coverage stages and that CoverageIndex semantics under AP:false are preserved.
- [DOD4] Documentation for coverage invariants, determinism and limitations is merged and aligned with existing architecture and invariants docs.

## Test Strategy
- [TS1] End-to-end Vitest suites exercising coverage-aware runs over small JSON Schema fixtures and OpenAPI specs, asserting each acceptance criterion and coverage metric.
- [TS2] Determinism tests that run the same configuration multiple times and compare normalized coverage reports.
- [TS3] Tests that instrument or mock network layers to ensure coverage stages remain I/O-free, plus manual and code-reviewed documentation updates.

## Mapping 9312.y → parent bullets
| Subtask      | Bullets                                   | Status   |
| 9312.9312001 | [KR1, DEL1, DOD1, TS1]                    | covered  |
| 9312.9312002 | [KR1, KR3, DEL1, DOD1, DOD3, TS1, TS3]    | covered  |
| 9312.9312003 | [KR1, KR2, KR3, DEL1, DEL2, DOD1, DOD2]   | covered  |
| 9312.9312004 | [KR5, DEL3, DOD4, TS3]                    | covered  |
