# Task ID: 9304

**Title:** Add CLI coverage modes, options and CI-friendly summary

**Status:** pending

**Dependencies:** 9301, 9302, 9303

**Priority:** high

**Description:** Expose coverage=off|measure|guided, dimensions, thresholds and report path via CLI flags and print a human-readable coverage summary for CI logs.

**Details:**

[Context]
Extend the CLI to configure coverage-aware behavior and surface summary metrics, per coverage-aware spec §6 (Execution modes & UX) and §7.2 (CLI summary). The CLI must support coverage modes, dimensions, thresholds, report path, excludeUnreachable and profiles, and output a clear summary for CI that emphasizes per-dimension and per-operation coverage before the global overall figure.

[Key requirements]
- Implement CLI flags: --coverage=off|measure|guided, --coverage-dimensions, --coverage-min, --coverage-report, --coverage-profile and --coverage-exclude-unreachable; map them to internal options and CoverageReport.run fields.
- Ensure --n (or --count) is reused as maxInstances for coverage=guided and is passed to the planner and evaluator.
- Implement CI-friendly summary output that prints metrics.byDimension, metrics.byOperation, metrics.overall, targetsByStatus and a short summary of planner caps and unsatisfied hints, in that order of importance.
- Ensure coverage=off behaves exactly as today with minimal overhead, and coverage=measure does not change outputs relative to coverage=off for fixed seeds; pipeline wiring must not invoke CoverageAnalyzer or coverage instrumentation when coverage=off.
- Implement coverage profiles as presets over maxInstances, dimensionsEnabled and planner caps:
  - quick: dimensionsEnabled = ['structure','branches'], small maxInstances (order of 50–100) and aggressive caps per dimension/schema/operation.
  - balanced (default): dimensionsEnabled = ['structure','branches','enum'], moderate maxInstances (order of 200–500) and moderate caps favoring branches and enums.
  - thorough: dimensionsEnabled = ['structure','branches','enum','boundaries'] once the boundaries dimension is available, maxInstances >= 1000 and planner caps disabled except for hard global constraints (e.g. global memory/time limits).
- Ensure any future debug/introspection CLI option that materializes additional targets beyond dimensionsEnabled is explicit opt-in and does not change metric or threshold semantics: coverage.overall, coverage.byDimension, coverage.byOperation and minCoverage MUST always be computed solely from dimensions listed in dimensionsEnabled.
- Document coverage options and profiles in CLI help text and examples to match the spec’s suggested usage and default behavior.

[Deliverables]
- Extended CLI option parsing in packages/cli/src/commands/generate.ts and openapi.ts.
- Summary printer in packages/cli/src/coverage/coverage-summary.ts.
- Updated --help output and docs snippets for coverage usage.

[Definition of Done]
- CLI accepts coverage flags and forwards them to the core pipeline and coverage evaluator consistently for JSON Schema and OpenAPI entrypoints.
- coverage=off, coverage=measure and coverage=guided modes can be invoked via CLI and map to the engine’s coverageMode field in the report and to whether CoverageAnalyzer/instrumentation are invoked.
- Profiles quick, balanced and thorough map to well-defined presets for maxInstances, dimensionsEnabled and planner caps, and tests verify that selecting a profile results in the expected internal configuration.
- Summary output for a representative run includes per-dimension and per-operation coverage, overall coverage, targetsByStatus and concise planner/hints summaries, with per-dimension and per-operation displayed before the overall figure.
- CLI examples in README or dedicated docs show typical coverage usage patterns and are kept in sync with the implemented flags and profiles.

**Test Strategy:**

CLI integration tests that run foundrydata generate and foundrydata openapi with different coverage flags and assert exit codes, coverage summary output and generated coverage-report JSON; tests that verify coverage=off does not trigger CoverageAnalyzer or coverage instrumentation; snapshot tests for the summary formatter to ensure ordering (byDimension, byOperation, overall) remains stable; tests that run the CLI with --coverage-profile=quick|balanced|thorough and assert that the resulting dimensionsEnabled, maxInstances and caps match the documented presets.

## Subtasks

### 9304.9304001. Add coverage flags to generate and openapi commands

**Status:** pending  
**Dependencies:** None  

Extend CLI argument parsing to accept coverage mode, dimensions, minCoverage, report path, profile and excludeUnreachable options.

### 9304.9304002. Map CLI coverage options to core pipeline configuration

**Status:** pending  
**Dependencies:** None  

Translate CLI flags into the coverage configuration passed to the pipeline orchestrator and coverage evaluator, ensuring coverage=off fully skips CoverageAnalyzer and coverage instrumentation, that coverage-report and minCoverage-related options are ignored (with a clear warning or note) when coverage=off, and that unknown or not-yet-implemented dimensions in --coverage-dimensions are handled deterministically (either rejected with a clear error or dropped with a diagnostic note).

### 9304.9304003. Implement coverage summary printer for CI logs

**Status:** pending  
**Dependencies:** None  

Format metrics.byDimension, metrics.byOperation, metrics.overall, targetsByStatus and diagnostics into a concise CLI summary, with per-dimension and per-operation metrics emphasized before overall.

### 9304.9304004. Add CLI tests for coverage modes and thresholds

**Status:** pending  
**Dependencies:** None  

Create tests that run the CLI with different coverage modes, profiles and minCoverage values and assert exit codes and summaries, including edge cases such as coverage=off combined with coverage-report/minCoverage flags and unknown dimensions in --coverage-dimensions.
