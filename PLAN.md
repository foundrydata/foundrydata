Task: 9401.9401003   Title: Wire classifier into generator and repair planning
Anchors: [spec://§6#generator-repair-contract, spec://§9#generator, spec://§10#repair-engine]
Touched files:
- packages/core/src/pipeline/orchestrator.ts
- packages/core/src/pipeline/types.ts
- packages/core/src/pipeline/__tests__/pipeline-orchestrator.test.ts

Approach:
Propagate the caller’s PlanOptions through the pipeline so Repair sees the same gValid/repair posture as Compose/Generate. Thread `planOptions` (resolved at pipeline entry) into the repair runner invocation and override signature, ensuring `allowStructuralInGValid` and other repair flags are honored instead of defaulting to strict mode. Keep the default code path unchanged when gValid is disabled. Add integration coverage in the orchestrator tests by overriding Generate to emit a deliberately underfilled G_valid object (missing a required field) while running with `planOptions.repair.allowStructuralInGValid:true`; assert that Repair performs the structural completion instead of being blocked, and that overrides can observe the forwarded planOptions. This guards against regressions where Repair silently ignores caller settings. Maintain deterministic seeds/outputs and preserve existing artifacts/metrics wiring. Target ≥80% per-file coverage with the new tests focusing on G_valid propagation.

Risks/Unknowns:
- Overriding Generate in tests must still respect gValid classification; ensure gValidIndex is passed to Repair when overrides bypass the default generator.
- Structural repair expectations depend on fixtures; validate that the chosen schema exercises required-add without conflicting guards.
Parent bullets couverts: [KR1, KR2, KR4, DEL2, DOD1, TS4]

DoD:
- [x] Contrat Generator vs Repair implémenté et aligné G_valid
- [x] Tests G_valid / Repair ajoutés ou mis à jour (cov ≥80 % fichiers touchés)
- [x] build/typecheck/lint/test/bench OK

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
