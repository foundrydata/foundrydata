Task: 9503   Title: Enforce per-pass Score-based commit rule in Repair
Anchors: [spec://§10#repair-philosophy, spec://§10#repair-philosophy-progress, spec://§10#process-order, spec://§15#metrics]
Touched files:
- packages/core/src/repair/repair-engine.ts
- packages/core/src/repair/__tests__/mapping-repair.test.ts
- packages/core/test/e2e/pipeline.integration.spec.ts
- PLAN.md

Approach:
For parent task 9503, and specifically subtask 9503.9503004, enforce the SPEC Score/commit rule at the level of each Repair pass without changing the AJV oracle or the (keyword → action) mapping. Refactor the per-item loop in `repairItemsAjvDriven` so that it tracks a `currentScore` for the working instance and treats every Repair pass as a candidate: within each pass, apply repairs into a local candidate instance with a local action buffer, re-run AJV, and compute `Score(candidate)` via `computeScore`. If and only if `Score(candidate) < currentScore`, commit the pass by replacing the working instance with the candidate, appending buffered actions to the global `actions[]`, and updating `currentScore`; otherwise revert the pass in-place by discarding the candidate and its actions/metrics and emitting a `REPAIR_REVERTED_NO_PROGRESS` diagnostic, then stop Repair for that item. Ensure this per-pass commit rule coexists with existing budgets (`attempts`, `bailOnUnsatAfter`) and G_valid guards without altering process order (shape → bounds → semantics → names → sweep). Finally, extend or add unit/integration tests so they cover scenarios with multiple passes (improve then worsen), proving that only strictly improving passes are committed, that non-improving passes are reverted locally (no leaked actions/metrics), and that coverage mode remains observational. Keep anchors within quota and REFONLY; no SPEC prose copied.

Risks/Unknowns:
- Interaction between per-pass revert and existing UNSAT_BUDGET_EXHAUSTED logic; must ensure stagnation is still detected via §10.P6 without double-counting failed passes.
- Ensuring that no existing tests rely (implicitly) on actions from non-committed passes being visible in metrics or diagnostics; adjust expectations carefully rather than weakening assertions.
Parent bullets couverts: [KR1, KR2, DEL1, DEL2, DEL3, DOD1, DOD2, DOD3, TS1, TS2, TS3]

DoD:
- [ ] Commit rule enforced per pass with Score(next) < Score(current) and non-improving passes reverted without leaking actions[] or metrics
- [ ] Existing stagnation/budget behaviour (UNSAT_BUDGET_EXHAUSTED) remains correct and deterministic under the new per-pass semantics
- [ ] Coverage mode does not affect Repair decisions or artefacts; only hint observability varies
- [ ] build/typecheck/lint/test/bench OK
- [ ] Traceability updated for 9503 and 9503.9503004

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
