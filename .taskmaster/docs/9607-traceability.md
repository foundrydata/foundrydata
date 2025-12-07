# 9607 Traceability

## Implementation Details
- [CTX1] profiles/simple.json uses an if/then conditional that requires metadata.tier when kind=service; guided coverage previously failed with FINAL_VALIDATION_FAILED, forcing bench to use measure as a workaround.
- [CTX2] Regression is addressed by allowing guided repair to iterate through nested conditional required fields without emitting UNSAT_BUDGET_EXHAUSTED, while keeping observability passive and deterministic.

## Key requirements
- [KR1] Guided mode must satisfy conditional requirements on profiles/simple.json (metadata.tier when kind=service) with no validation failures (guided ≥ measure invariant).
- [KR2] Fix must stay deterministic and metrics-tolerant (metrics toggle does not alter outputs/branches), with no additional side effects in generation/repair.
- [KR3] Bench default coverageMode returns to guided once the regression is fixed and the bench gate passes on the simple profile.
- [KR4] A regression test captures the guided path on profiles/simple.json so future changes cannot reintroduce the validation failure.

## Deliverables
- [DEL1] Regression test `packages/core/test/e2e/coverage-simple-profile.regression.test.ts` covering guided mode and conditional metadata.tier.
- [DEL2] Repair engine adjustment so guided mode gets sufficient iterations to satisfy nested conditional required fields instead of bailing with UNSAT_BUDGET_EXHAUSTED.
- [DEL3] Bench runner default coverageMode set to guided after the fix, still emitting coverage-report artifacts and passing gates.

## Definition of Done
- [DOD1] Guided pipeline on profiles/simple.json (seed 42, count ≥25) completes with valid instances; every service instance includes metadata.tier from the enum.
- [DOD2] Regression test passes and standard build/typecheck/lint/test/bench checks execute cleanly.
- [DOD3] Bench harness with guided default passes performance gates on the bundled bench config (p95/memory under thresholds).
- [DOD4] Observability remains passive: enabling/disabling metrics does not change outputs or branch choices for this profile.

## Test Strategy
- [TS1] E2E regression test in packages/core/test/e2e to assert guided validity and conditional metadata coverage.
- [TS2] Bench run with guided default to ensure no validation failures and gates stay green.

## Mapping 9607.y → parent bullets
| Subtask | Bullets | Status |
| 9607.1 | [KR1, KR4, DEL1, DEL2, DOD1, DOD2, TS1] | covered |
| 9607.2 | [KR1, KR2, DEL2] | covered |
| 9607.3 | [KR3, DEL3, DOD3, TS2] | covered |
