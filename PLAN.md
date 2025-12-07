Task: 9607.1   Title: Add regression test for profiles/simple.json with coverage=guided
Anchors: [spec://§6#phases, spec://§15#rng, cov://§5#coverage-report]
Touched files:
- packages/core/test/e2e/coverage-simple-profile.regression.test.ts
- packages/core/src/repair/repair-engine.ts
- packages/reporter/src/bench/runner.ts
- packages/reporter/src/engine/runner.ts

Approach:
I will first add a failing regression test that runs profiles/simple.json in coverage=guided with a fixed seed and asserts two things: all generated/repaired instances validate against the schema, and when kind=service the conditional tier is present. This will reproduce the observed FINAL_VALIDATION_FAILED. Then I will adjust the guided path in the pipeline to ensure conditional requirements are satisfied: (a) when coverage mode is guided and the planner enumerates branches, ensure the instance coverage state includes conditional-required properties; (b) if generation still emits missing conditionals, allow repair to fill them by honoring conditional required (not AP:false) without exhausting the budget. If necessary, extend the coverage runtime to carry guided hinting into generation to avoid unreachable validations. Finally, once the test passes and guided produces valid instances, I will restore the reporter bench default coverageMode from measure back to guided. Observability remains passive (no change in outputs with metrics toggle); deterministic seeds preserved.

Risks/Unknowns:
- The fix might need changes in generator vs repair; must avoid broad behavior changes outside guided mode.
- Bench guided could still hit caps on other profiles; need to ensure defaults remain stable.
- Avoid introducing non-determinism in coverage/planner ordering.

Parent bullets couverts: [KR4, DOD2, TS2]

Checks:
- build: npm run build
- test: npm run test -- packages/core/test/e2e/coverage-simple-profile.regression.test.ts
- bench: npm run bench
- diag-schema: true
