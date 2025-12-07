Task: 9402.9402004   Title: Write tests for G_valid arrays and golden snapshots
Anchors: [spec://§6#generator-repair-contract, spec://§9#generator, spec://§9#arrays-contains, spec://§6#phases]
Touched files:
- packages/core/src/pipeline/__tests__/pipeline-orchestrator.test.ts
- test/acceptance/arrays/contains-vs-maxitems.spec.ts
- PLAN.md

Approach:
Add missing coverage to prove G_valid arrays are AJV-valid by construction when formats are enforced and to lock behavior with golden expectations. Extend the pipeline orchestrator tests with a G_valid UUID+contains array case that runs `validateFormats: true` to ensure the generator emits format-respecting UUIDs and that no Repair actions occur; keep seeds fixed for determinism and assert gValidIndex marks the array as G_valid. Add a non-G_valid parity test that compares both items and contains-related diagnostics when toggling `planOptions.gValid` to confirm caps/diags stability. In acceptance, reuse the shared fixture to add a compact snapshot (inline) of generated arrays for the UUID+contains motif under G_valid, capturing shape and a sample UUID so structural regressions surface early; also snapshot diagnostics for the non-G_valid uniqueItems+contains motif while toggling gValid to ensure no drift. Keep fixtures stable (description-only tweaks if needed) and avoid large snapshots by limiting count/seed. Maintain ≥80% coverage on touched test files and avoid code changes outside test surface.

Risks/Unknowns:
- UUID generation under `validateFormats:true` must stay deterministic; verify seeds and avoid multiple distinct UUIDs that would bloat snapshots.
- Diagnostics parity for non-G_valid motifs may differ if prior caps change; be prepared to adapt assertions to actual baseline outputs without overfitting.
Parent bullets couverts: [KR2, KR3, KR4, DEL3, DOD1, DOD2, DOD3, TS1, TS2, TS4]

DoD:
- [x] Contrat Generator vs Repair implémenté pour arrays G_valid (items+contains) avec formats
- [x] Tests G_valid vs non-G_valid (items, diagnostics, snapshots) cov ≥80 % fichiers touchés
- [x] build/typecheck/lint/test/bench OK

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
