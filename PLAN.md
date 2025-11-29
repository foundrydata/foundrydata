Task: 9308.9308002   Title: Map coverageStatus to CLI exit codes
Anchors: [cov://§7#thresholds-mincoverage, cov://§7#cli-summary]
Touched files:
- packages/cli/src/coverage/coverage-exit-codes.ts
- packages/cli/src/coverage/coverage-exit-codes.test.ts
- packages/cli/src/index.ts
- packages/cli/src/index.test.ts
- packages/core/src/errors/codes.ts
- docs/spec-coverage-aware-v1.0.md
- .taskmaster/docs/9308-traceability.md
Approach:
I will zero in on the CLI exit-path described in `cov://§7#cli-summary` and the minCoverage enforcement note in `cov://§7#thresholds-mincoverage`. First, I will refactor the coverage-failure handling into a dedicated helper module (`packages/cli/src/coverage/coverage-exit-codes.ts`) so the message formatting and exit code computation live alongside the shared `ErrorCode.COVERAGE_THRESHOLD_NOT_MET` mapping. Next, I will audit `packages/core/src/errors/codes.ts` to verify the coverage failure code is documented and unique, and confirm `packages/cli/src/index.ts` uses the new helper after `handlePipelineOutput`. After the production wiring is in place, I will extend `packages/cli/src/index.test.ts` (measure + guided coverage runs) and add targeted tests for the helper module so stderr shows the required summary and `process.exit` is called with the configured coverage exit code. I will keep an eye on `docs/spec-coverage-aware-v1.0.md` to ensure we do not rely on descriptive per-dimension thresholds for the enforcement, and then update `.taskmaster/docs/9308-traceability.md` to record that this subtask covers KR3/DEL2/DOD1/DOD2/TS2.
Risks/Unknowns:
- If the CLI already uses `ErrorCode.COVERAGE_THRESHOLD_NOT_MET` in other contexts, I need to justify why it still counts as a dedicated coverage failure code per the spec.
- Mocking `process.exit` in the tests may require avoiding interference with other tests that inspect global exit state; I must ensure mocks are restored promptly.
Parent bullets couverts: [KR3, DEL2, DOD1, DOD2, TS2]
SPEC-check: sections cov://§7#cli-summary and cov://§7#thresholds-mincoverage remain aligned—the CLI summary still emphasizes coverageStatus, and enforcement continues to happen only when `metrics.coverageStatus` is `'minCoverageNotMet'`.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
