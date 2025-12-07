Task: 9403.9403003   Title: Add fixtures and tests for G_valid objects
Anchors: [spec://§6#generator-repair-contract, spec://§6#phases, spec://§9#generator, spec://§19#envelope]
Touched files:
- test/fixtures/g-valid-objects.json
- test/acceptance/objects/g-valid-objects.spec.ts
- test/acceptance/gvalid-no-repair.acceptance.spec.ts
- PLAN.md

Approach:
Strengthen the object-side G_valid contract by adding coverage for the two gaps: (1) negative unsatisfiable schemas and (2) basic bounds beyond `required`. Extend `test/fixtures/g-valid-objects.json` with one G_valid-but-unsatisfiable schema (e.g., conflicting enum/const or impossible minProperties) and one positive G_valid schema that exercises `minProperties` or const/enum so bounds are visible. In `test/acceptance/objects/g-valid-objects.spec.ts`, add a negative test that runs the pipeline on the unsatisfiable G_valid schema with `planOptions.gValid: true`, asserting the pipeline fails (`status: 'failed'`) and that validate-stage diagnostics exist and conform to the envelope shape/phase rules. Add/extend a positive test to assert that minProperties/enum/const bounds are satisfied pre-Repair with no structural actions, covering the “basic bounds” clause. Update `test/acceptance/gvalid-no-repair.acceptance.spec.ts` to include metrics/repair invariants for the new positive object case (no repair actions, gValid metrics zeros) so the no-repair guard remains holistic. Keep seeds fixed and reuse existing fixtures to avoid snapshot churn. Ensure coverage ≥80% on touched test files by asserting all new branches (success/failure) and leverage existing helpers; avoid altering generator code to stay within subtask scope.

Risks/Unknowns:
- Need a clean unsatisfiable schema that deterministically fails without relying on Repair behavior; pick a simple enum/const or minProperties conflict that is stable across AJV.
- Validate-stage diagnostics content may need minor normalization; must assert shape/phase without overfitting message text.
Parent bullets couverts: [KR2, KR3, DEL3, DOD2, DOD3, TS2, TS3]

DoD:
- [x] Contrat Generator vs Repair implémenté pour objets G_valid (required + basic bounds)
- [x] Tests G_valid vs non-G_valid (incl. négatifs) cov ≥80 % fichiers touchés
- [x] build/typecheck/lint/test/bench OK

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
