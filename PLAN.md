Task: 9600.9600006   Title: Metrics flag propagation and deterministic comparator
Anchors: [spec://§2#observability-surfaces, spec://§15#metrics, spec://§15#rng, spec://§19#envelope]
Touched files:
- packages/core/src/pipeline/orchestrator.ts
- packages/core/src/pipeline/types.ts
- packages/core/src/coverage/runtime.ts
- packages/shared/src/types/coverage-report.ts
- packages/core/test/util/determinism-compare.ts
- packages/core/src/pipeline/__tests__/metrics-toggle.integration.test.ts
- packages/core/src/coverage/__tests__/coverage-runtime.test.ts
- packages/reporter/src/engine/report-builder.ts
- packages/reporter/src/engine/runner.ts

Approach:
I will propagate the canonical PlanOptions.metrics toggle into the MetricsCollector creation so that disabling metrics via plan options actually disables collection, and I will plumb the explicit metricsEnabled flag into run artefacts (PipelineResult, coverage-report/v1 run block, reporter/meta) so comparability can rely on the recorded toggle. I will update the determinism comparator to treat nameEnumElapsedMs as non-deterministic (wall-clock based) and exclude it from equality checks to keep observability passive. The coverage runtime and shared types will gain the metricsEnabled field, with orchestrator feeding it into coverage reports. Reporter builders will forward the flag into report meta/platform consumers without altering behavior. Tests: extend metrics-toggle integration to assert metricsEnabled reflects the toggle (including planOptions.metrics=false), adjust coverage runtime tests for the new run field, and add a comparator test to confirm nameEnumElapsedMs is stripped. No pipeline semantics should change; metrics remain optional and passive.

Risks/Unknowns:
- Adding metricsEnabled to PipelineResult/coverage-report/reporter types may ripple into snapshots or downstream consumers; need to update all expected shapes.
- PlanOptions.metrics precedence vs explicit metrics.enabled could surprise callers; I will default to planOptions.metrics when enabled is undefined and keep explicit overrides intact.
- nameEnumElapsedMs might still be wanted for diagnostics; excluding it from determinism views should not hide regressions but I must ensure no test relies on it.

Parent bullets couverts: [KR1, KR2, DEL1, DEL2, DOD1, DOD2, TS2, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
