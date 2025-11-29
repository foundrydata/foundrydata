Task: 9308.9308001   Title: Propagate minCoverage config to CoverageEvaluator
Anchors: [cov://§4#coverage-evaluator, cov://§7#thresholds-mincoverage, cov://§7#cli-summary]
Touched files:
- packages/core/src/coverage/evaluator.ts
- packages/core/src/pipeline/orchestrator.ts
- packages/core/src/coverage/__tests__/coverage-report-json.test.ts
- packages/core/src/coverage/__tests__/evaluator.test.ts
- packages/core/test/unit/api.spec.ts
- packages/cli/src/index.ts
- packages/cli/src/index.test.ts
- packages/core/src/errors/codes.ts
- docs/spec-coverage-aware-v1.0.md
- .taskmaster/docs/9308-traceability.md
Approach:
I will comb through the coverage evaluator pipeline, CLI wiring, and supporting tests to confirm that the code faithfully implements the spec requirements described in the quoted anchors. Starting with `packages/core/src/coverage/evaluator.ts`, I will ensure `CoverageEvaluatorInput` accepts threshold wiring, `evaluateCoverage` keeps `overall`, `byDimension`, `byOperation`, and `targetsByStatus` cached, and `coverageStatus` becomes `'minCoverageNotMet'` whenever `metrics.overall < thresholds.overall` while `thresholds.byDimension/byOperation` remain descriptive only, matching `cov://§4#coverage-evaluator` and `cov://§7#thresholds-mincoverage`. Next, I will verify that `packages/core/src/pipeline/orchestrator.ts` passes `options.coverage?.minCoverage` into `CoverageEvaluatorInput` so the node-level `artifacts.coverageReport.metrics.thresholds.overall` appears in the JSON report used by CLI/Node API. I will then inspect `packages/cli/src/index.ts` plus `packages/cli/src/index.test.ts` to confirm CLI summary output references `coverage.overall`, writes the dedicated min-coverage failure message, and exits via `ErrorCode.COVERAGE_THRESHOLD_NOT_MET` per `cov://§7#cli-summary`. Finally, I will extend the unit tests and CLI coverage failure test suite (`packages/core/test/unit/api.spec.ts`, `packages/cli/src/index.test.ts`) to cover guided-mode runs so the Node API and CLI remain consistent with the same coverageStatus/thresholds expectations when minCoverage is enforced.
Risks/Unknowns:
- If the implementation omits `thresholds` from the CLI/Node API coverage report when `minCoverage` is undefined, downstream callers may not see the advertised fields; I need to confirm the behavior matches the “MAY be populated” wording.
- There is no explicit textual requirement for a numeric exit code in the spec; I must decide whether the current `ErrorCode.COVERAGE_THRESHOLD_NOT_MET` mapping satisfies the “dedicated non-zero exit code” promise or if a SPEC question is needed.
Parent bullets couverts: [KR1, KR2, DEL1, DOD1, TS1, TS4]
SPEC-check: CoverageEvaluator, thresholds, and CLI summary sections (cov://§4, cov://§7#thresholds-mincoverage, cov://§7#cli-summary) are aligned with the current implementation—no conflicts detected during this review.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
