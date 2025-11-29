Task: 9308.9308003   Title: Test coverage threshold enforcement end-to-end
Anchors: [cov://§7#thresholds-mincoverage, cov://§7#cli-summary]
Touched files:
- packages/core/test/e2e/coverage-threshold.spec.ts
- packages/cli/src/index.test.ts
- .taskmaster/docs/9308-traceability.md
- .taskmaster/tasks/tasks.json
Approach:
I will build a thin end-to-end harness that mirrors the spec’s acceptance scenario where `minCoverage=0.8`, `coverage.overall≈0.6`, and the CLI must still expose `coverageStatus` plus the dedicated coverage failure exit code described by `cov://§7#thresholds-mincoverage` and `cov://§7#cli-summary`. First, I will add an e2e pipeline test under `packages/core/test/e2e/coverage-threshold.spec.ts` that runs a schema with two `oneOf` branches, enforces `coverage.minCoverage`, and asserts the resulting `coverageReport.metrics.coverageStatus`/`metrics.thresholds.overall` combination while also confirming the normal coverage summary is still populated even though the threshold was missed. Second, I will enhance the CLI generate coverage failure test to ensure it emits the `[foundrydata] coverage:` summary even when `coverageStatus` becomes `minCoverageNotMet`, and that the stderr stream still contains the `coverage status: minCoverageNotMet` message before the CLI exits with the configured dedicated code. These additions keep both the Node API and CLI behaviors aligned with `cov://§7#cli-summary`’s structure and make sure per-dimension/per-operation thresholds remain descriptive only while the global guardrail is enforced. Finally, I will update the traceability notes and task records to reflect that this subtask closes out KR4/KR5/DEL3/DOD2/DOD3/TS3/TS4.
Risks/Unknowns:
- The e2e pipeline run must keep determinism while forcing overall coverage below `minCoverage`, so the schema and seeds need to stay stable; if the coverage drop is too small the assertion may flicker.
- Capturing both the `[foundrydata] coverage:` summary and the `coverage status: minCoverageNotMet` line may require buffering stderr properly now that `enforceCoverageThreshold` exits the process.
Parent bullets couverts: [KR4, KR5, DEL3, DOD2, DOD3, TS3, TS4]
SPEC-check: The new e2e coverage run and CLI regression keep `coverageStatus`/`coverageReport.metrics.thresholds.overall` aligned with the dedicated exit code and human-readable summary mandated by `cov://§7#thresholds-mincoverage` and `cov://§7#cli-summary`.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
