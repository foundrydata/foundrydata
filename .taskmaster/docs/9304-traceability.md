# Traceability — Task 9304 (Add CLI coverage modes, options and CI-friendly summary)

This document maps the parent task 9304 bullets from Implementation Details, Deliverables, Definition of Done and Test Strategy to its subtasks 9304.9304001–9304.9304006.

## Parent bullets

### Implementation Details

- [KR1] Implement CLI flags (`--coverage`, `--coverage-dimensions`, `--coverage-min`, `--coverage-report`, `--coverage-profile`, `--coverage-exclude-unreachable`) and map them to internal options and the CoverageReport.run fields.
- [KR2] Reuse `--n` / `--count` as `maxInstances` for `coverage=guided` and pass this bound through to the planner and coverage evaluator.
- [KR3] Provide a CI-friendly summary that prints `metrics.byDimension`, `metrics.byOperation`, `metrics.overall`, `targetsByStatus` and a short view of planner caps and unsatisfied hints, in that order of importance.
- [KR4] Ensure `coverage=off` behaves exactly as today with negligible overhead and that `coverage=measure` does not change generated instances for fixed seeds; pipeline wiring must not invoke CoverageAnalyzer or coverage instrumentation when coverage is off.
- [KR5] Implement coverage profiles (`quick`, `balanced`, `thorough`) as presets over `maxInstances`, `dimensionsEnabled` and planner caps with the ranges and behaviors described in the coverage-aware spec.
- [KR6] Guarantee that any future debug/introspection CLI option that materializes additional targets beyond `dimensionsEnabled` is explicit opt-in and never changes metric or threshold semantics: `coverage.overall`, `coverage.byDimension`, `coverage.byOperation` and `minCoverage` are always computed solely from dimensions listed in `dimensionsEnabled`.
- [KR7] Document coverage options and profiles in CLI help text and examples so that recommended usage and defaults stay aligned with the spec.

### Deliverables

- [DEL1] Extended CLI option parsing for coverage flags in the `generate` and `openapi` commands.
- [DEL2] Coverage summary printer module under `packages/cli/src/coverage/coverage-summary.ts`.
- [DEL3] Updated `--help` output and documentation snippets that demonstrate coverage modes, dimensions, thresholds, report path, profiles and excludeUnreachable options.

### Definition of Done

- [DOD1] The CLI accepts coverage flags and forwards them consistently to the core pipeline and coverage evaluator for JSON Schema and OpenAPI entrypoints.
- [DOD2] `coverage=off`, `coverage=measure` and `coverage=guided` map to the engine’s `coverageMode` field in the report and to whether CoverageAnalyzer/instrumentation are invoked, with `coverage=off` skipping coverage components entirely.
- [DOD3] Profiles `quick`, `balanced` and `thorough` map to well-defined presets for `maxInstances`, `dimensionsEnabled` and planner caps, and tests verify that selecting a profile yields the expected internal configuration.
- [DOD4] Summary output for representative runs shows per-dimension and per-operation coverage, overall coverage, `targetsByStatus` and concise planner/hints summaries, with per-dimension and per-operation displayed before the overall figure.
- [DOD5] CLI examples in README or dedicated docs demonstrate coverage usage patterns and remain in sync with the implemented flags and profiles.

### Test Strategy

- [TS1] CLI integration tests that run `foundrydata generate` and `foundrydata openapi` with different coverage flags and assert exit codes, coverage summary output and generated coverage-report JSON.
- [TS2] Tests that verify `coverage=off` does not trigger CoverageAnalyzer or coverage instrumentation.
- [TS3] Snapshot tests for the summary formatter to ensure ordering (`byDimension`, `byOperation`, `overall`) remains stable.
- [TS4] Tests that run the CLI with `--coverage-profile=quick|balanced|thorough` and assert that the resulting `dimensionsEnabled`, `maxInstances` and planner caps match the documented presets.

## Mapping 9304 subtasks → parent bullets

- **9304.9304001 – Add coverage flags to generate and openapi commands**  
  Covers: [KR1], [DEL1], contributes to [DOD1], [TS1]. Status: covered.

- **9304.9304002 – Map CLI coverage options to core pipeline configuration**  
  Covers: [KR2], [KR4], [KR5], [KR6], [DOD1], [DOD2], [DOD3], contributes to [TS1], [TS2], [TS4]. Status: covered.

- **9304.9304003 – Implement coverage summary printer for CI logs**  
  Covers: [KR3], [DEL2], [DOD4], [TS3]. Status: covered.

- **9304.9304004 – Add CLI tests for coverage modes and thresholds**  
  Covers: [DEL3], [DOD2], [DOD3], [DOD5], [TS1], [TS2], [TS3], [TS4]. Status: covered.

- **9304.9304006 – Enforce coverage profile presets**  
  Covers: [KR5], [DOD3], [TS4]. Status: covered.
