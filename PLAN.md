Task: 9303.9303003   Title: Implement reportMode full vs summary behavior
Anchors: [cov://§7#json-coverage-report]
Touched files:
- packages/core/src/pipeline/orchestrator.ts
- packages/core/src/pipeline/types.ts
- packages/core/src/coverage/__tests__/coverage-report-json.test.ts
- packages/cli/src/config/coverage-options.ts
- packages/cli/src/index.ts

Approach:
I will add a coverage report mode option (full|summary) to the CLI and pipeline so the existing helper in `applyReportModeToCoverageTargets` can actually be driven from user inputs rather than the current hard-coded `full`. This means extending every coverage option struct (`PipelineOptions`, CLI parser) with a `reportMode` field, wiring a new `--coverage-report-mode` flag in both the root and OpenAPI commands, and parsing/validating it through the same shared helpers that already resolve coverage modes and dimensions. The CLI will also keep canonical dimensions when the user leaves `--coverage-dimensions` empty so `dimensionsEnabled` is never an empty list for measure/guided runs, aligning with the “Dimensions enabled” requirements in the spec.

In the orchestrator I will resolve the canonical dimensions (falling back to `[structure, branches, enum]`), reuse them for the analyzer, planner, evaluator and the final report metadata, and expose the parsed `reportMode` there. The coverage report builder will now set `reportMode` from options, pass it to `applyReportModeToCoverageTargets`, and keep the `run.dimensionsEnabled` array in sync with the resolved defaults. After the plumbing is wired I will add integration tests that generate coverage reports without explicit dimensions and with `reportMode:'summary'` to prove the new knobs produce the expected trailer (empty `targets[]`, canonical dims, `reportMode` metadata) while retaining deterministic metrics.

Risks/Unknowns:
- Summary mode truncates payloads; the test fixture needs enough uncovered targets to make the “empty targets” behavior meaningful without making the run flaky.
- The CLI defaults must stay aligned with the pipeline defaults so `run.dimensionsEnabled` never drops to an empty array even if multiple entry points use the API directly.
Parent bullets couverts: [KR5, KR6, DOD2, TS2, TS5]
SPEC-check: Verified anchor cov://§7#json-coverage-report covers the report-mode semantics and dimension behavior that these changes expose.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
