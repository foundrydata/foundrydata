# Traceability — Task 9308 (Enforce global minCoverage threshold and map to exit codes)

This document maps parent task 9308 bullets from Implementation Details, Deliverables, Definition of Done and Test Strategy to subtasks 9308.9308001–9308.9308003.

## Parent bullets

### Implementation Details

- [KR1] Add `minCoverage` configuration to coverage options and propagate it to the CoverageEvaluator so `metrics.thresholds.overall` reflects the requested guardrail.
- [KR2] Compute `metrics.thresholds.overall` and set `metrics.coverageStatus` to `'minCoverageNotMet'` when `metrics.overall < minCoverage`, keeping the rest of the coverage metrics unchanged.
- [KR3] Map `'minCoverageNotMet'` coverageStatus to a dedicated non-zero CLI exit code that is distinct from other error conditions.
- [KR4] Ensure the Node API returns coverageStatus alongside the CoverageReport so callers can react programmatically, including the `thresholds.overall` value.
- [KR5] Keep `thresholds.byDimension` and `thresholds.byOperation` descriptive only in V1, without affecting behavior.

### Deliverables

- [DEL1] Threshold handling in CoverageEvaluator and coverage-report/v1 metrics so thresholds fields are populated and coverageStatus is computed deterministically.
- [DEL2] CLI exit code mapping and documentation for coverage failures (including coverage summary output) that respect the diagnostic-only nature of unsatisfied hints.
- [DEL3] Node API shape that exposes `coverageStatus` and `thresholds.overall` in its structured result.

### Definition of Done

- [DOD1] Runs with `metrics.overall` below `minCoverage` yield `metrics.coverageStatus: 'minCoverageNotMet'` and cause the CLI to exit with the configured coverage failure code.
- [DOD2] Acceptance scenario (`minCoverage=0.8`, `coverage.overall=0.6`) is covered by tests that assert the exit code and coverage summary content.
- [DOD3] Node API returns a CoverageReport that includes `coverageStatus` and `thresholds.overall`.
- [DOD4] Adding or omitting per-dimension/per-operation thresholds does not affect enforcement in V1 and remains purely descriptive.

### Test Strategy

- [TS1] CoverageEvaluator unit tests for threshold wiring and coverageStatus computation.
- [TS2] CLI tests that run with `minCoverage` higher than achievable coverage and assert the human-readable summary plus dedicated exit code.
- [TS3] Node API tests that inspect the returned CoverageReport, covering both metrics and thresholds exposed to callers.
- [TS4] Regression checks that thresholds.byDimension/byOperation remain descriptive and do not change behavior when present.

## Mapping 9308 subtasks → parent bullets

- **9308.9308001 – Propagate minCoverage config to CoverageEvaluator**  
  Covers: [KR1], [KR2], [DEL1], [DOD1], [TS1], [TS3], [TS4] (completed; ensures thresholds.overall is populated from the options, coverageStatus honors minCoverage without altering the rest of the coverage metrics, and guided-mode CLI/Node API tests confirm the same enforcement path).
 - **9308.9308002 – Map coverageStatus to CLI exit codes**  
  Covers: [KR3], [DEL2], [DOD1], [DOD2], [TS2] (done; relocates the coverage failure messaging/exit-code logic into `packages/cli/src/coverage/coverage-exit-codes.ts`, keeps the summary/exit wiring in the CLI, and exercises the path via helper + CLI tests per cov://§7#cli-summary).
-- **9308.9308003 – Test coverage threshold enforcement end-to-end**  
  Covers: [KR4], [KR5], [DEL3], [DOD2], [DOD3], [TS3], [TS4] (done; added an end-to-end coverage run that exercises the Node API coverage report plus the CLI exit summary in a minCoverage failure scenario while ensuring descriptive thresholds stay inert).

Status:

- 9308.9308001: done
- 9308.9308002: done
- 9308.9308003: done
