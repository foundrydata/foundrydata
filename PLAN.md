Task: 9325.1   Title: Implement early conflict detection
Anchors: [cov://§4#coverageanalyzer, cov://§4#coverageplanner, cov://§5#hints-interaction-with-repair]
Touched files:
- packages/core/src/coverage/analyzer.ts
- packages/core/src/coverage/coverage-planner.ts
- packages/core/src/coverage/conflict-detector.ts
- packages/core/src/coverage/index.ts
- packages/core/src/pipeline/orchestrator.ts
- packages/core/src/coverage/__tests__/coverage-planner.test.ts
- packages/core/src/coverage/__tests__/conflict-detector.test.ts
- packages/core/src/coverage/__tests__/analyzer.test.ts

Approach:
I will expand the analyzer so it exposes the unsat-path snapshot called out by cov://§4#coverageanalyzer, annotates any target under those paths with metadata and status, and reuses the same helper during planning. planTestUnits will now accept the canonical schema, coverage index and diagnostics context, skip unreachable targets, and call a new ConflictDetector helper before building hints; the detector will cross-reference coverage-index constraints, unsat paths and target metadata so that coverEnumValue/preferBranch/ensurePropertyPresence hints that are provably impossible emit CONFLICTING_CONSTRAINTS and stay out of TestUnit.hints, in line with cov://§4#coverageplanner. The orchestrator will take the resulting CoveragePlannerResult, merge the conflicting hint diagnostics into artifacts.coverageReport.unsatisfiedHints, and keep coverage metrics untouched so the behavior stays diagnostic-only as described in cov://§5#hints-interaction-with-repair. I will add unit tests for the detector and the planner flow plus a regression that checks analyzer metadata, ensuring conflicting hints are surfaced without affecting coverage metrics, then run build/typecheck/lint/test/bench.

Risks/Unknowns:
- Need to avoid double-reporting the same hint both early and again during generation; conflicting hints must be stripped from planner output so generator hooks never replay them.
- The new metadata path should not mutate targets cached elsewhere (planner caps, coverage report) in ways that break deduplication or diagnostics.
- Ensuring the new tests cover the interplay between CoverageIndex, diag paths, and hint filtering may require crafting synthetic compose diagnostics or targets.

Parent bullets couverts: [KR1, KR2, TS1]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
