Task: 9604   Title: Subtask 9604.9604002 — Add CI gate engine for observability KPIs (remediation)
Anchors: [spec://§2#observability-surfaces, spec://§7#platform-kpis-gates, spec://§15#metrics, spec://§19#payloads, cov://§5#coverage-report]
Touched files:
- packages/reporter/src/engine/runner.ts
- packages/reporter/src/cli.ts
- packages/reporter/src/bench/runner.ts
- packages/reporter/src/gates/index.ts
- packages/reporter/src/gates/__tests__/gates.test.ts
- packages/reporter/src/platform-view/index.ts
- packages/reporter/src/platform-view/__tests__/platform-view.test.ts
- packages/reporter/src/schemas/reporter-platform-view-v1.schema.json
- packages/reporter/test/reporter-platform-view-schema.test.ts
- packages/reporter/test/fixtures/gates.trace.json
- packages/reporter/test/fixtures/reporter-platform-view.sample.json
- packages/reporter/test/fixtures/coverage-report.v1.sample.json
- packages/shared/src/types/diag.metrics.ts
- packages/reporter/src/bench/types.ts

Approach:
To restore spec alignment, I will first enable coverage generation for reporter runs so gates use real coverage-report/v1: plumb coverage options (measure/guided) into reporter pipeline options, have CLI/bench propagate minCoverage/coverage toggles when provided, and persist the coverage-report artifact alongside report/platform-view. Gate evaluation will consume that summary, honoring thresholds either from coverage.thresholds or explicit minCoverage. Next, I will implement bench-only performance gates (p95LatencyMs ≤120, memoryPeakMB ≤512) per §7.4 while keeping determinism gates free of SLIs. I will enhance platform-view derivation to preserve canonPath/tiers from repairUsageByMotif when available and normalize selectedOperations/operationsScope comparability; update the platform-view schema to require non-empty selectedOperations when operationsScope is selected. Tests/fixtures will be refreshed: gate fixtures to cover coverage-planning severity and perf-gate cases; platform-view schema tests to reject missing/empty selectedOperations; CLI/runner/bench tests to expect coverage artifacts and gate behavior. Throughout, observability remains passive—no new control-flow changes—by reusing existing artifacts and deterministic normalization only.

Risks/Unknowns:
- Enabling coverage in reporter runs may alter snapshots; I will scope output expectations to deterministic fields and update fixtures accordingly.
- Bench perf thresholds are environment-sensitive; I must anchor tests on static fixtures to avoid flakes.
- repairUsageByMotif currently lacks canonPath/tiers in metrics; preserving optional fields must stay backward compatible when absent.

Parent bullets couverts: [KR4, DEL2, DOD2, TS2]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
