Task: 9405.9405002   Title: Instrument Repair to emit motif-tagged usage events
Anchors: [spec://§6#generator-repair-contract, spec://§6#phases, spec://§10#repair-engine, spec://§15#metrics]
Touched files:
- packages/core/src/repair/repair-engine.ts
- packages/core/src/util/repair-usage-metrics.ts
- packages/core/src/repair/__tests__/mapping-repair.test.ts
- packages/reporter/src/platform-view/index.ts
- packages/reporter/src/schemas/reporter-platform-view-v1.schema.json
- packages/reporter/src/platform-view/__tests__/platform-view.test.ts
- test/acceptance/gvalid-no-repair.acceptance.spec.ts
- docs/tests-traceability.md

Approach:
Align motif-level repair usage metrics with the SPEC contract by tagging usage events with canonPath + motif + G_valid and preserving those fields end-to-end. In the repair engine, change the motif buckets to key on (canonPath, motifId, gValid) and pass canonPath through to recordRepairUsageEvent, including zero-action G_valid buckets so observability remains deterministic. Extend recordRepairUsageEventOnSnapshot to merge by canonPath as well as motif/gValid and to store canonPath in the bucket. Update the reporter platform-view builder and schema to keep the gValid flag and canonPath in the derived repairUsageByMotif entries, while maintaining deterministic sorting and non-negative clamps. Strengthen unit/integration tests: repair mapping tests should assert canonPath and gValid preservation; reporter platform-view tests should cover the new fields and ordering; acceptance no-repair tests should assert that G_valid buckets include canonPath and gValid while remaining zero-action. Align tests-traceability invariants with the enforced behavior. Keep changes scoped to instrumentation/observability, avoiding pipeline logic beyond metrics tagging. Ensure coverage ≥80% on touched test files.

Risks/Unknowns:
- Need to ensure canonical path normalization is stable for both repair actions and G_valid-only buckets to avoid duplicate buckets.
- Reporter schema change must stay backward compatible; verify fixtures reflect new fields without breaking consumers.
Parent bullets couverts: [KR1, KR2, DEL2, DOD1, DOD2, TS1, TS2]

DoD:
- [x] Contrat Generator vs Repair implémenté (tag canonPath + gValid sur usage events)
- [x] Tests G_valid / Repair mis à jour (unit + acceptance) cov ≥80 %
- [x] build/typecheck/lint/test/bench OK

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
