# 9327 Traceability

## Context
- [C1] Detect coverage hints that are impossible to satisfy under the canonical schema and coverage-aware constraints so they can be classified early and surfaced diagnostically without affecting coverage metrics or target identities.

## Key requirements
- [KR1] Implement structural feasibility checks in CoveragePlanner/ConflictDetector for `ensurePropertyPresence`, `preferBranch` and `coverEnumValue`, using canonical schema structure, CoverageIndex and Compose UNSAT metadata rather than ad hoc heuristics.
- [KR2] Record impossible hints as `UnsatisfiedHint` entries with `reasonCode:'CONFLICTING_CONSTRAINTS'`, remove them from `TestUnit.hints`, and keep `CoverageTarget.id`, ordering and `status` unchanged so the behavior remains diagnostic-only.
- [KR3] Align generator and repair fallback paths so any impossible hint that bypasses planner validation is still reported as `CONFLICTING_CONSTRAINTS` via `recordUnsatisfiedHint`, without changing AJV validity, RNG determinism or the instance stream.

## Implementation notes
- [IM1] Keep feasibility checks deterministic and side-effect-free, relying only on canonical schema, CoverageIndex and diagnostics; treat ambiguous cases as still feasible instead of over-classifying conflicts, and avoid introducing new solver-style reasoning.

## Test strategy
- [TS1] Add unit tests for ConflictDetector and CoveragePlanner that exercise not/required contradictions, boolean-false subschemas, AP:false CoverageIndex gaps and branch/enum index bounds for hints.
- [TS2] Extend generator and pipeline/e2e tests to assert that invalid hints produce `CONFLICTING_CONSTRAINTS` entries in `coverageReport.unsatisfiedHints` while coverage metrics and minCoverage behavior remain unchanged.

## Mapping 9327 → parent bullets
| Subtask | Parent bullets | Status |
| 9327 | [KR1, KR2, KR3, IM1, TS1, TS2] | covered |
