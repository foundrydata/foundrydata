Task: 9501   Title: Golden sig(e)/Score(x) tests for AJV errors
Anchors: [spec://§10#repair-philosophy-progress, spec://§10#repair-philosophy, spec://§14#planoptionssubkey, spec://§19#payloads]
Touched files:
- packages/core/src/repair/score/__tests__/score-golden.test.ts
- packages/core/src/repair/score/__tests__/score.test.ts
- packages/core/src/repair/score/__tests__/error-signature.test.ts
- PLAN.md

Approach:
Acting under the “No Task Available” playbook for the repair-philosophy tag, reinforce task 9501’s deliverables by adding golden tests that exercise sig(e) and Score(x) on real AJV error lists. First, craft a compact object schema that triggers representative keywords (required, additionalProperties, minimum, contains) and validate a failing instance with Ajv configured for determinism (allErrors:true, strict:false). Use the existing buildErrorSignature helper to derive signatures and assert the exact canonical strings (keyword, canonPath fallback to schemaPath, instancePath, stableParamsKey) sorted for stability; verify Score(x) matches the distinct-signature count. Then add a determinism test that runs the same validation twice, compares the serialized signature sets under reversed error order, and checks Score equality to guard against latent ordering or serialization drift. Finally, tighten canonPathFromError behavior by pinning multi-mapping tie-breaks (lexicographically smallest revPtrMap entry) so revPtrMap changes cannot alter signatures silently. Keep scope limited to tests—no production logic changes—and maintain REFONLY anchors. Ensure coverage ≥80% on the touched test modules and avoid touching Repair behavior, budgets, or diagnostics beyond observability of Score components.

Risks/Unknowns:
- Ajv error shapes are version-sensitive; golden expectations must match current params payloads to avoid false positives on future Ajv bumps.
- Canonical pointer mapping in real runs may differ from schemaPath; tie-break behavior asserted here must stay compatible with ptr-map invariants.
Parent bullets couverts: [KR1, DEL1, DEL2, DEL3, DOD1, DOD3, TS1, TS2, TS3]

DoD:
- [ ] Golden signatures cover required/additionalProperties/minimum/contains with exact paramsKey strings
- [ ] Determinism test proves signature set/Score independence from error ordering and repeated runs
- [ ] build/typecheck/lint/test/bench OK

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
