Task: 9401.9401002   Title: Implement classifier over Compose artifacts
Anchors: [spec://§6#generator-repair-contract, spec://§8#responsibilities, spec://§9#generator, spec://§9#arrays-contains, spec://§10#repair-engine]
Touched files:
- packages/core/src/transform/g-valid-classifier.ts
- packages/core/src/generator/foundry-generator.ts
- packages/core/src/repair/repair-engine.ts
- packages/core/src/pipeline/orchestrator.ts
- packages/core/src/transform/__tests__/g-valid-classifier.spec.ts
- packages/core/src/repair/__tests__/mapping-repair.test.ts
- packages/core/src/pipeline/__tests__/pipeline-orchestrator.test.ts
- packages/core/src/repair/__fixtures__/repair-philosophy-microschemas.ts

Approach:
Fix G_valid classification to honor the Compose effective view and spec baselines. Extend the classifier to ingest Compose artifacts (coverageIndex, containsBag, diagnostics) so arrays are gated by the computed contains bag: single-need bags remain eligible, multi-need or capped/unsat bags become ComplexContains and stay non-G_valid. Tighten AP:false detection using must-cover provenance instead of map presence, and permit simple objects assembled via non-branching allOf when they meet v1 exclusions and have no unevaluated guards. Thread signature changes through orchestrator and dependents. In Generate, enforce the G_valid items+contains contract by producing witnesses that satisfy items ∩ contains for each need when the motif is G_valid, leaving legacy behavior untouched when the flag is off or motif is non-G_valid. Keep Repair tier policy and metrics consistent with the new motifs. Strengthen unit/integration tests: classifier cases for multi-contains exclusion and allOf-derived simple objects; pipeline tests proving G_valid arrays satisfy both items and contains without structural repair and that flag-off runs remain stable. Maintain determinism and target ≥80% coverage on touched files.

Risks/Unknowns:
- AP:false provenance detection must not break existing coverage guards or rename preflight consumers.
- Combining items and contains for G_valid arrays must preserve RNG ordering and avoid tuple/prefixItems regressions.
- Need to ensure updated classifier signature does not miss any call site in pipeline/generator/repair.
Parent bullets couverts: [KR1, KR2, KR3, KR4, DEL1, DEL2, DOD1, DOD2, TS1, TS2, TS3, TS4]

DoD:
- [x] Contrat Generator vs Repair implémenté et aligné G_valid
- [x] Tests G_valid / Repair ajoutés ou mis à jour (cov ≥80 % fichiers touchés)
- [x] build/typecheck/lint/test/bench OK

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
