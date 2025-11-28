# Traceability — Task 9311 (Add coverage diff tool for multi-run comparison (M2))

This document maps the parent task 9311 bullets from Implementation Details, Deliverables, Definition of Done and Test Strategy to its subtasks 9311.9311001–9311.9311004.

## Parent bullets

### Implementation Details

- [KR1] Implement a CoverageReport diff algorithm that classifies targets into `unchanged`, `added`, `removed` and `statusChanged` based on a stable identity (id plus identifying shape such as dimension, kind and canonPath).
- [KR2] Compute and present deltas for `metrics.overall` and `metrics.byOperation` between two reports, highlighting regressions; metric deltas are computed over the common universe of targets and dimensions (targets present in both reports and dimensions enabled on both sides).
- [KR3] Identify newly uncovered targets (present in the newer report and uncovered, or that transitioned from `hit:true` to `hit:false`) and present them explicitly as new gaps rather than folding them into aggregate regressions.
- [KR4] Ensure the diff is only considered valid when both reports share the same coverage-report format version and compatible FoundryData engine major (and, for `metrics.byOperation` deltas, a compatible operationsScope); otherwise surface a clear error and do not attempt to compare incompatible reports.
- [KR5] Provide a CLI entrypoint (e.g. `foundrydata coverage diff A.json B.json`) that loads two coverage-report/v1 JSON files, runs the diff and prints a textual summary suitable for CI, with the option to return a non-zero exit code on regressions.

### Deliverables

- [DEL1] Coverage diff implementation and internal summary types under `packages/reporter/src/coverage/coverage-diff.ts`.
- [DEL2] CLI command wiring for `foundrydata coverage diff` under `packages/cli/src/commands/coverage-diff.ts` (or equivalent CLI module).
- [DEL3] JSON fixtures and tests for typical diff scenarios (regressions, added/removed targets, newly uncovered gaps and compatibility errors) under `packages/reporter/src/coverage/__tests__/coverage-diff.spec.ts` and CLI test suites.

### Definition of Done

- [DOD1] The coverage diff tool correctly identifies target categories (unchanged, added, removed, statusChanged) and metric deltas on synthetic and representative real coverage reports.
- [DOD2] Incompatible coverage-report versions, engine majors or irreconcilable operationsScope differences are rejected with clear diagnostics, and the diff does not attempt to compare incompatible reports.
- [DOD3] CLI diff output includes a concise summary of `metrics.overall` delta, per-operation regressions and lists of newly uncovered targets, suitable for CI logs.
- [DOD4] Tests cover edge cases such as empty reports, operations added or removed, dimensions newly enabled or disabled, targets changing status to or from `unreachable`, and runs where coverage improves as well as regresses.

### Test Strategy

- [TS1] Unit tests for coverage diff classification and metric deltas using small synthetic coverage-report/v1 fixtures to validate target categories, overall deltas and per-operation deltas in isolation.
- [TS2] Integration tests that run coverage twice on modified schemas or OpenAPI specs, then invoke the diff command (CLI or Node) and assert on the reported deltas and newly uncovered gaps.
- [TS3] Tests that exercise error handling when coverage-report versions, engine majors or operationsScope values are incompatible, ensuring clear diagnostics and no partial diff output.
- [TS4] Snapshot tests for the CLI diff summary output to keep ordering and formatting of regressions, improvements and new gaps stable across changes.

## Mapping 9311 subtasks → parent bullets

- **9311.9311001 – Implement CoverageReport diff classification logic**  
  Covers: [KR1], [DEL1], contributes to [DOD1], [TS1]. Status: covered (target classification and newlyUncovered list implemented in `coverage-diff.ts` with unit tests over small synthetic fixtures).

- **9311.9311002 – Compute metric deltas and regressions**  
  Covers: [KR2], [KR3], contributes to [DEL1], [DOD1], [DOD4], [TS1]. Status: covered (adds metric-aware diff summary over the common universe of targets and dimensions, per-operation regression detection and explicit reporting of newly uncovered targets, with focused unit tests in `coverage-diff.spec.ts`).

- **9311.9311003 – Add CLI command for foundrydata coverage diff**  
  Covers: [KR5], [DEL2], contributes to [DOD1], [DOD3], [TS2], [TS4]. Status: covered (adds a `foundrydata coverage diff` subcommand that loads two coverage-report/v1 JSON files, delegates diff computation to the core coverage diff API, prints a CI-friendly summary of overall and per-operation deltas plus newly uncovered targets, and sets a non-zero exit code when regressions or new gaps are detected).

- **9311.9311004 – Add fixtures and tests for coverage diff behavior**  
  Covers: [KR4], [DEL3], [DOD2], [DOD4], [TS2], [TS3], [TS4]. Status: pending (extended fixtures, CLI-level tests and compatibility/error-path coverage remain to be added to complete the multi-run diff contract).
