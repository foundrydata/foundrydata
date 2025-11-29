Task: 9327   Title: Detect impossible coverage hints
Anchors: [cov://§3#coverage-model, cov://§4#coverage-planner, cov://§5#unsatisfied-hints-repair, cov://§7#json-coverage-report, spec://§8#early-unsat-checks]
Touched files:
- packages/core/src/coverage/conflict-detector.ts
- packages/core/src/coverage/coverage-planner.ts
- packages/core/src/generator/foundry-generator.ts
- packages/core/src/coverage/__tests__/coverage-planner.test.ts
- packages/core/src/coverage/__tests__/conflict-detector.test.ts
- packages/core/test/e2e/coverage-guided-planner.spec.ts
- packages/core/src/pipeline/__tests__/pipeline-orchestrator.test.ts
- AGENTS.md
- .taskmaster/docs/9327-traceability.md

Approach:
I will extend the existing ConflictDetector and planner wiring so that ensurePropertyPresence, preferBranch and coverEnumValue hints are checked against canonical schema structure, CoverageIndex and Compose UNSAT metadata before TestUnits are built, in line with cov://§3#coverage-model and cov://§4#coverage-planner. For properties, the helper will recognise cases where the owning subschema is structurally impossible (e.g. false schemas or branches marked UNSAT) or AP:false forbids the requested name, and surface them as CONFLICTING_CONSTRAINTS instead of letting hints reach the generator. For branches and enums, it will use planDiag and canonical pointers to detect unreachable oneOf/anyOf branches and enum indices that are out of range, recording structured UnsatisfiedHint entries without changing coverage target IDs or statuses, consistent with spec://§8#early-unsat-checks. I will keep the generator’s defensive path for invalid hints, but align it so that any hint that slips past planner validation reports CONFLICTING_CONSTRAINTS via recordUnsatisfiedHint, keeping unsatisfiedHints diagnostic-only per cov://§5#unsatisfied-hints-repair and cov://§7#json-coverage-report. Finally, I will update AGENTS.md and a new 9327-traceability file to capture how impossible hints are classified and tested so future tasks can build on the same decision process.

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
