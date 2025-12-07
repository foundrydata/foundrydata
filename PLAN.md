Task: 9503   Title: Enforce Score-based commit rule and revert semantics in Repair
Anchors: [spec://§10#repair-philosophy, spec://§10#repair-philosophy-progress, spec://§10#repair-philosophy-observability, spec://§10#process-order, spec://§15#metrics]
Touched files:
- packages/core/src/repair/repair-engine.ts
- packages/core/src/repair/__tests__/mapping-repair.test.ts
- packages/core/test/e2e/pipeline.integration.spec.ts
- PLAN.md

Approach:
For parent task 9503 and subtask 9503.9503003, align the Repair engine with the SPEC Score/commit rule and observability requirements without changing the AJV oracle or the (keyword → action) mapping. First, refactor the per-item loop in `repairItemsAjvDriven` so that it tracks a `currentScore` and treats each Repair pass as a candidate mutation: after applying actions for a pass, recompute Score using `computeScore` and commit the pass only if `Score(next) < Score(current)`, otherwise revert to the pre-pass instance. This ensures strict monotonic progress and prevents “worsen-then-fix” sequences. Second, make the revert atomic: buffer per-pass actions and metrics so that when a pass is reverted, neither `actions[]` nor the Repair usage/tiers metrics include those rolled-back attempts; only committed actions flow into `actions` and G_valid motif buckets. Third, decouple the commit rule from coverage by removing any `coverage.mode` condition around revert logic and keeping coverage strictly observational (only hint tracing). Finally, adjust `REPAIR_REVERTED_NO_PROGRESS` diagnostics to anchor `canonPath` and `details.keyword` on the attempted action (using the first buffered action’s canonPath/keyword), while leveraging existing revert counters from metrics. Update and extend the unit and integration tests referenced for Score/commit rule and revert observability so they assert the new per-pass semantics, the absence of reverted actions in `actions[]`, and coverage-independence. Keep anchors within quota and REFONLY; no SPEC prose copied.

Risks/Unknowns:
- Interaction between per-pass revert and existing UNSAT_BUDGET_EXHAUSTED logic; must ensure stagnation is still detected via §10.P6 without double-counting failed passes.
- Ensuring that no existing tests rely (implicitly) on actions from non-committed passes being visible in metrics or diagnostics; adjust expectations carefully rather than weakening assertions.
Parent bullets couverts: [KR1, KR2, DEL1, DEL2, DEL3, DOD1, DOD2, DOD3, TS1, TS2, TS3]

DoD:
- [ ] Commit rule enforced per pass with Score(next) < Score(current) and reverted passes not leaking into actions[] or metrics
- [ ] REPAIR_REVERTED_NO_PROGRESS carries canonPath/keyword from the attempted action and remains phase=repair with correct details
- [ ] Coverage mode does not affect Repair decisions or artifacts; only hint observability varies
- [ ] build/typecheck/lint/test/bench OK
- [ ] Traceability updated for 9503 and 9503.9503003

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
