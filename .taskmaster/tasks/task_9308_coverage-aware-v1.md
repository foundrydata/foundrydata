# Task ID: 9308

**Title:** Enforce global minCoverage threshold and map to exit codes

**Status:** pending

**Dependencies:** 9303, 9304

**Priority:** medium

**Description:** Wire metrics.overall to a configurable minCoverage threshold and ensure CLI and Node API expose structured coverageStatus results.

**Details:**

[Context]
Implement enforcement of minCoverage on metrics.overall and connect it to CLI exit codes and Node API status, per §7.3 (Thresholds) and the acceptance criterion on coverage threshold. In V1, only the overall threshold is honored; per-dimension and per-operation thresholds are reserved for future use.

[Key requirements]
- Add minCoverage configuration to coverage options and propagate it to CoverageEvaluator.
- Compute metrics.thresholds.overall and metrics.coverageStatus:'ok'|'minCoverageNotMet' based on metrics.overall and minCoverage.
- Map coverageStatus to a dedicated non-zero CLI exit code when minCoverage is not met, distinct from other error conditions.
- Ensure Node API returns coverageStatus alongside the CoverageReport so callers can react programmatically.
- Keep thresholds.byDimension and thresholds.byOperation descriptive only in V1, without affecting behavior.

[Deliverables]
- Thresholds handling in CoverageEvaluator and coverage-report/v1 metrics.
- CLI exit code mapping and documentation for coverage failures.
- Node API shape that exposes coverageStatus and thresholds to callers.

[Commands]
- npm run build
- npm run test -- --runInBand
- npm run test packages/cli/test/coverage-cli.spec.ts -- --runTestsByPath

[Definition of Done]
- Runs with metrics.overall below minCoverage produce metrics.coverageStatus:'minCoverageNotMet' and the CLI exits with the configured coverage failure code.
- Acceptance scenario where minCoverage=0.8 and metrics.overall=0.6 is covered by tests that assert exit code and summary content.
- Node API returns a structured result that includes coverageStatus and thresholds.overall.
- Adding or omitting per-dimension and per-operation thresholds in metrics does not affect behavior in V1.

**Test Strategy:**

Unit tests in CoverageEvaluator for threshold handling; CLI tests that run with minCoverage set above expected coverage and assert non-zero exit codes and clear summary output; Node API tests that inspect coverageStatus and thresholds in the returned CoverageReport; regression tests to ensure behavior remains unchanged when thresholds.byDimension or thresholds.byOperation are present but not enforced.

## Subtasks

### 9308.9308001. Propagate minCoverage config to CoverageEvaluator

**Status:** pending  
**Dependencies:** None  

Extend coverage options to include minCoverage and apply it when computing thresholds.overall and coverageStatus.

### 9308.9308002. Map coverageStatus to CLI exit codes

**Status:** pending  
**Dependencies:** None  

Add a dedicated coverage failure exit code in the CLI and wire it to metrics.coverageStatus.

### 9308.9308003. Test coverage threshold enforcement end-to-end

**Status:** pending  
**Dependencies:** None  

Create an end-to-end test that runs with minCoverage above achievable coverage and asserts exit code and summary diagnostics.
