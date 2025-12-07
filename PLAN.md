Task: 9404.9404003   Title: Add tests and diagnostics for G_valid Repair violations
Anchors: [spec://§6#generator-repair-contract, spec://§10#repair-engine, spec://§15#metrics]
Touched files:
- packages/core/src/repair/__tests__/mapping-repair.test.ts
- PLAN.md

Approach:
Add missing coverage to prove the Repair engine honors the G_valid contract for non-structural actions and budget handling. First, add a unit test using the existing G_valid simple object motif where a string field violates `minLength` while `planOptions.gValid` is true and structural guards remain active; assert that Repair performs the non-structural pad, the instance becomes valid, and no `REPAIR_GVALID_STRUCTURAL_ACTION` diagnostic fires. Second, add a G_valid regression that forces structural fixes to stay blocked (e.g., missing required + attempts=1) so the loop cannot make progress; assert the output stays unchanged, `REPAIR_GVALID_STRUCTURAL_ACTION` surfaces, and `UNSAT_BUDGET_EXHAUSTED` records budget exhaustion in the repair phase. Keep seeds/defaults unchanged to avoid snapshot churn, and reuse existing micro-schemas/metrics helpers for determinism. Maintain ≥80% coverage on the touched test file by asserting diagnostics, metrics counters where relevant, and item equality. Stay within subtask scope—no pipeline or generator changes.

Risks/Unknowns:
- Need deterministic paths to hit UNSAT_BUDGET_EXHAUSTED under G_valid without altering engine logic; using attempts=1 with blocked structural fixes should suffice but may need adjustment if AJV error ordering changes.
- Non-structural minLength repair must not trigger tier-disabled diagnostics; guard against unintended policy side effects.
Parent bullets couverts: [KR2, KR3, DEL3, DOD2, DOD3, TS2, TS3]

DoD:
- [x] Contrat G_valid vs Repair vérifié pour actions non structurelles et budgets (diag/schema OK)
- [x] Tests G_valid (non-structural + budget UNSAT) cov ≥80 % fichiers touchés
- [x] build/typecheck/lint/test/bench OK

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
