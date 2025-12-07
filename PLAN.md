Task: 9502   Title: Add revert-no-progress counter + tighten repair diag schema
Anchors: [spec://§10#repair-philosophy, spec://§10#repair-philosophy-progress, spec://§15#metrics, spec://§19#envelope]
Touched files:
- packages/core/src/util/metrics.ts
- packages/shared/src/types/diag.metrics.ts
- packages/core/src/diag/schemas.ts
- packages/core/src/diag/__tests__/diag-codes.test.ts
- packages/core/src/util/__tests__/metrics.test.ts
- packages/reporter/test/__snapshots__/reporter.snapshot.test.ts.snap
- PLAN.md

Approach:
For 9502, restore compliance with spec §10/§15 by adding the missing revert-no-progress counter and tightening the REPAIR_TIER_DISABLED payload schema. First, extend the shared metrics shape (`packages/shared/src/types/diag.metrics.ts`) and core collector defaults (`packages/core/src/util/metrics.ts`) with a deterministic `repair_reverted_no_progress` counter, plus helper increment and snapshot propagation. Wire the counter into the AJV-driven repair engine where REPAIR_REVERTED_NO_PROGRESS is emitted so metrics are incremented exactly once per revert and remain gated by metrics.enabled; ensure coverage independence. Second, restrict `allowedMaxTier` to the spec’s {0,1,2} domain in the diagnostics schema to prevent invalid payloads from slipping through. Update validation tests (`diag-codes.test.ts`, envelope tests) and metrics tests to assert the new counter behaves deterministically and is zeroed when disabled. Refresh reporter snapshots to include the new counter without altering other fields. Keep the change surface minimal: do not modify repair behavior, tiers, or Score logic—only observability. All anchors stay within quota (≤5) and REFONLY; no spec prose copied.

Risks/Unknowns:
- Reporter snapshot churn: adding one metric field may shift ordering; must ensure deterministic serializer and stable sort to avoid flaky diffs.
- Counter placement: must ensure the revert counter increments exactly once per REPAIR_REVERTED_NO_PROGRESS, not per action attempt; confirm via targeted test.
Parent bullets couverts: [KR1, KR2, DEL1, DEL2, DEL3, DOD1, DOD2, DOD3, TS1, TS2, TS3]

DoD:
- [ ] Metrics include repair_reverted_no_progress with deterministic increment and reporter snapshot coverage
- [ ] REPAIR_TIER_DISABLED schema enforces allowedMaxTier domain per spec
- [ ] build/typecheck/lint/test/bench OK
- [ ] Traceability updated for 9502
- [ ] build/typecheck/lint/test/bench OK

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
