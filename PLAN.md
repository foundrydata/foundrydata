Task: 9326   Title: Detect impossible hints conflicting with keywords
Anchors: [cov://§3#coverage-model, cov://§4#coverage-planner, cov://§5#unsatisfied-hints-repair, cov://§7#json-coverage-report, spec://§8#early-unsat-checks]
Touched files:
- packages/core/src/coverage/conflict-detector.ts
- packages/core/src/coverage/conflict-detector-utils.ts
- packages/core/src/coverage/coverage-planner.ts
- packages/core/src/coverage/__tests__/coverage-planner.test.ts
- packages/core/src/coverage/__tests__/conflict-detector.test.ts
- packages/core/test/e2e/coverage-guided-planner.spec.ts
- AGENTS.md
- .taskmaster/docs/9326-traceability.md

Approach:
I will review the existing ConflictDetector and planner integration added for 9325/9327 and tighten it so that impossible hints are captured exactly where the coverage-aware spec expects: during planning, using canonical schema structure, Compose UNSAT metadata and AP:false CoverageIndex gaps as proof (cov://§3#coverage-model, cov://§4#coverage-planner, spec://§8#early-unsat-checks). I will extract shared pointer and UNSAT helpers into conflict-detector-utils so ConflictDetector focuses on feasibility checks, then extend property and branch logic to cover not/required contradictions while ensuring property presence hints on AP:false schemas rely solely on CoverageIndex.has. In coverage-planner tests, I will add cases and light property-based checks that feed random but valid hints through validateHintStructuralFeasibility to guard against false CONFLICTING_CONSTRAINTS, and in guided planning/e2e tests I will assert that impossible hints appear as CONFLICTING_CONSTRAINTS entries in coverageReport.unsatisfiedHints without altering coverage metrics or by-dimension breakdowns (cov://§5#unsatisfied-hints-repair, cov://§7#json-coverage-report). Finally, I will update AGENTS.md and the new 9326 traceability file so future work reuses the same impossible-hint rule instead of reintroducing divergent heuristics.

Risks/Unknowns:
- Avoiding double-reporting between planner-level conflicts and generator fallbacks requires clear precedence rules and tests that assert each impossible hint appears exactly once in unsatisfiedHints.
- Structural checks must not misclassify merely unlikely hints as impossible; property-based tests and targeted fixtures are needed to guard against false positives under AP:false and complex allOf/oneOf compositions.
- Keeping coverage metrics and minCoverage behavior unchanged while adding new unsatisfiedHints flows may require tightening existing pipeline tests that snapshot coverage reports.

Parent bullets couverts: [KR1, KR2, KR3, IM1, TS1, TS2]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
