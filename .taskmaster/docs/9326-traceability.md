# 9326 Traceability

## Context
- [C1] Detect coverage hints that are impossible because they conflict with schema keywords (not/required, allOf/oneOf inconsistencies, AP:false constraints) and surface them early as planner-level diagnostics.

## Key requirements
- [KR1] Implement structural feasibility checks in the CoveragePlanner for ensurePropertyPresence, preferBranch and coverEnumValue hints, using canonical schema structure, Compose UNSAT signals and CoverageIndex for AP:false rather than ad hoc heuristics.
- [KR2] Ensure impossible hints are recorded as UnsatisfiedHint entries with reasonCode:'CONFLICTING_CONSTRAINTS' during planning, removed from TestUnit.hints, and that valid hints in the same unit are preserved.
- [KR3] Document the impossible-hint rule and its scope in AGENTS.md so future coverage-aware tasks reuse the same classification instead of reintroducing divergent behavior.

## Implementation notes
- [IM1] Reuse existing ConflictDetector and analyzer/Compose metadata for feasibility checks, keep detection deterministic and side-effect-free, and avoid broad UNSAT guesses that would over-classify hints as conflicting.

## Test strategy
- [TS1] Extend coverage-planner unit tests to exercise not/required contradictions, AP:false property gaps and branch/enum index bounds for hints, including property-based checks that avoid false positives on valid hints.
- [TS2] Use planner/e2e guided coverage tests to assert that impossible hints appear exactly once in coverageReport.unsatisfiedHints with CONFLICTING_CONSTRAINTS, while coverage metrics and by-dimension values remain unchanged.

## Mapping 9326 → parent bullets
| Subtask | Parent bullets | Status |
| 9326 | [KR1, KR2, KR3, IM1, TS1, TS2] | covered |
