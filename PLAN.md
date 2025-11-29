Task: 9308   Title: 9308.9308001 – Propagate minCoverage config to CoverageEvaluator
Anchors: [cov://§7#thresholds-mincoverage, cov://§7#cli-summary]
Touched files:
- packages/core/src/coverage/__tests__/coverage-report-json.test.ts
- packages/core/test/unit/api.spec.ts
- packages/cli/src/index.ts
- packages/cli/src/index.test.ts
- .taskmaster/docs/9308-traceability.md

Approach:
Start by making sure the CoverageEvaluator wiring honors `minCoverage` as described in §7.3: the pipeline must tag `metrics.thresholds.overall`, compute `coverageStatus` as `'minCoverageNotMet'` whenever `overall` falls short, and leave the rest of the report unchanged. I will add an integration test in `coverage-report-json.test.ts` and a Node API test in `api.spec.ts` that both configure `coverage.minCoverage` higher than what a single-branch schema can deliver, then assert that the returned report contains `coverageStatus: 'minCoverageNotMet'` and `metrics.thresholds.overall` equals the requested guardrail. Once the evaluator behavior is solid, I will extend the CLI summary/exit path (citing §7.2) by logging the status after the usual `formatCoverageSummary()` output and by calling a helper that prints the failure detail and exits with the new coverage-failure code. The CLI test suite will run this command with `--coverage count` and assert `process.exit` fires with `getExitCode(ErrorCode.COVERAGE_THRESHOLD_NOT_MET)` while the stderr summary mentions `minCoverageNotMet`. The approach also includes keeping `thresholds.byDimension`/`byOperation` descriptive, and it respects the mandated command order: `npm run build`, `npm run typecheck`, `npm run lint`, `npm run test`, `npm run bench`.

Risks/Unknowns:
Making the CLI exit after the summary must not suppress the coverage report write path or run again, so I will keep the helper after the summary block and only exit when the helper sees `'minCoverageNotMet'`. Coverage thresholds can be very close, so the tests will use a schema with two mutually exclusive branches to ensure `overall` stays safely below the 0.8–0.9 guardrail; we also need to guard against flaky `process.exit` observers by restoring spies and removing temporary files. Parent bullets couverts: [KR1, KR2, DEL1, DOD1, TS1, TS4]
SPEC-check: coverage thresholds + CLI summary behavior remain aligned with cov://§7#thresholds-mincoverage and cov://§7#cli-summary.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
