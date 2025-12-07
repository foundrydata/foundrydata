Task: 9406   Title: Close gaps in G_valid surfacing (CLI wiring + docs)
Anchors: [spec://§6#generator-repair-contract, spec://§6#phases, spec://§10#repair-engine, spec://§15#metrics, spec://§19#payloads]
Touched files:
- packages/core/src/types/options.ts
- packages/cli/src/index.test.ts
- packages/cli/src/__tests__/profiles.test.ts
- README.md
- docs/COMPREHENSIVE_FEATURE_SUPPORT.md
- docs/tests-traceability.md
- PLAN.md

Approach:
Address the remaining discrepancies between the implemented G_valid contract and its public surfacing. First, bring the PlanOptions inline doc in `packages/core/src/types/options.ts` in line with the strict default posture (gValid defaults to true per spec) to avoid misleading API users. Then strengthen CLI integration tests: extend `packages/cli/src/index.test.ts` to assert three key postures via the existing debug configuration dump—default/strict (G_valid on, structural repair blocked), `--gvalid-profile compat` (G_valid off, legacy behavior), and `--gvalid-profile relaxed` (G_valid on with structural repair allowed). Add a precedence test in `packages/cli/src/__tests__/profiles.test.ts` to ensure explicit `--gvalid-relax-repair` wins over profiles. For documentation, add a concise “Reading G_valid repair usage metrics” note to `README.md` and expand `docs/COMPREHENSIVE_FEATURE_SUPPORT.md` to explain the `gValid_*` counters, expected zeros in strict mode, and which CLI flags/profiles toggle them; update `docs/tests-traceability.md` to point to that guidance for interpreting the contract invariants. Keep scope strictly to surfacing—no generator/repair behavior changes—and reuse deterministic fixtures. Aim for ≥80% coverage on updated tests and keep anchors REFONLY without copying SPEC prose.

Risks/Unknowns:
- Debug output format stability: assertions rely on JSON emitted by `--debug-passes`; any future formatting drift would require more robust parsing.
- Terminology alignment: G_valid metrics wording must match existing `gValid_*` counters to avoid confusion with coverage metrics.
Parent bullets couverts: [KR2, KR3, DEL2, DEL3, DOD2, DOD3, TS2, TS3]

DoD:
- [x] G_valid defaults and profiles verified via CLI integration tests
- [x] Docs clarify G_valid repair metrics and flag/profile mapping
- [x] build/typecheck/lint/test/bench OK

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
