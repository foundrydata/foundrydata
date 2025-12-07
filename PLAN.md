Task: 9604.9604002   Title: Add CI gate engine for observability KPIs
Anchors: [spec://§7#platform-kpis-gates, spec://§15#metrics, spec://§2#observability-surfaces, cov://§5#coverage-report, cov://§7#thresholds]
Touched files:
- packages/reporter/src/gates/index.ts
- packages/reporter/src/gates/__tests__/gates.test.ts
- packages/reporter/src/engine/runner.ts
- packages/reporter/src/cli.ts
- packages/reporter/src/bench/runner.ts
- packages/reporter/test/fixtures/gates.trace.json

Approach:
I need to turn the gate engine into an actually enforced surface for reporter runs while aligning the signals with the spec. First, I will expand `evaluateGates` to cover the missing regression signals: repair regressions (UNSAT_BUDGET_EXHAUSTED, REPAIR_REVERTED_NO_PROGRESS) and guided≥measure/coverage planning expectations, while keeping SLIs ignored for determinism and respecting minCoverage vs coverage.status semantics. Then I will integrate gate evaluation into the reporter pipeline outputs: `runEngineWithArtifacts` should compute gates from fatal/warn diagnostics, diag.metrics and the derived coverage summary, expose the result, and ensure CLI/bench runners fail with a non-zero exit on fail and emit a warn message when status=warn without altering artifacts (observability remains passive). I will update the trace fixture and tests to assert the new issues and the integration path (CLI run produces platform-view and gate status; bench propagates gate status per schema). Finally, I will keep determinism by avoiding any wall-clock/env dependency and by reusing existing metrics/coverage payloads only. Parent bullets couverts: [KR4, DEL2, DOD2, TS2]

Risks/Unknowns:
- Need to avoid double-counting coverage thresholds when both status=minCoverageNotMet and explicit minCoverage config are present; decide precedence per spec.
- Bench harness currently ignores gates entirely; wiring failures to exit codes could break downstream expectations—ensure behavior is clearly constrained to fail/warn while still writing artifacts.
- Guided≥measure detection may not have a direct signal; I will gate only on available planner caps/unplanned evidence and deterministic repair regressions to stay within observed payloads.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
