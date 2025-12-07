Task: 9602   Title: Fix G_valid tier-disabled counters and guided coverage regression
Anchors: [spec://§2#observability-surfaces, spec://§10#repair-philosophy-observability, spec://§15#metrics, cov://§5#coverage-report]
Touched files:
- packages/core/src/repair/repair-engine.ts
- packages/core/src/repair/__tests__/mapping-repair.test.ts
- packages/core/src/pipeline/__tests__/repair-observability.regression.test.ts

Approach:
We need to restore the spec guarantee that policy blocks in G_valid zones surface both a deterministic diagnostic (REPAIR_TIER_DISABLED) and the matching tierDisabled counter while keeping observability passive. I will first map the existing guard paths in repair-engine where structural G_valid checks short-circuit before tier policy accounting (required without default, minItems growth) and route them through applyTierPolicyForAction so counters and diagnostics are emitted even when the action is skipped. The change must not mutate items when the guard blocks repairs, so the logic will increment metrics and push the diagnostic but still return without editing instances. After code changes, I will extend mapping-repair tests to cover the missing cases: a required-without-default path and minItems growth in a G_valid motif, asserting tierDisabled increments and REPAIR_TIER_DISABLED is emitted alongside the structural diagnostic while items remain untouched. For coverage independence, I will add a guided-coverage scenario to the existing repair-observability regression, comparing off vs measure vs guided using normalizePipelineResultForDeterminism with metrics strip toggles to ensure outputs and repair metrics (including gValid_* and tierDisabled) stay equal and diagnostics remain schema-valid. I will rerun the full validation chain (build → typecheck → lint → test → bench) and ensure diagnostics envelopes still validate. Parent bullets couverts: [KR1, KR2, KR3, DEL1, DEL3, DOD1, DOD2, DOD3, TS2, TS3]

Risks/Unknowns:
- Ensuring applyTierPolicyForAction is invoked without duplicating counters (must avoid double increments if both guard and policy paths fire).
- Guided coverage run might alter hint application; need to strip metrics appropriately and ensure determinism comparator ignores timing/SLIs while keeping deterministic counters.
- Existing reporter/gates expectations rely on zeroing metrics when disabled; must avoid changing behavior when metrics.enabled=false.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
