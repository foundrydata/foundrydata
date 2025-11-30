# Traceability — Task 9323 (Document coverage-report/v1 and coverage diff tooling)

This document maps the parent task 9323 bullets from Implementation Details, Deliverables, Definition of Done and Test Strategy to its subtasks 9323.9323001–9323.9323003.

## Parent bullets

### Implementation Details

- [KR1] Add a concise description of the `coverage-report/v1` JSON structure to `packages/reporter/README.md`, covering the header (version, engine, run), `metrics.overall`, `metrics.byDimension`, `metrics.byOperation`, `metrics.targetsByStatus`, `targets`/`uncoveredTargets` and `thresholds`/`coverageStatus`.
- [KR2] Document how users obtain `coverage-report/v1` files from the core CLI (e.g. `--coverage-report` option on `foundrydata generate` / `openapi`) and clarify how the reporter layer can consume or coexist with these files.
- [KR3] Add a dedicated section describing the coverage diff CLI (e.g. `foundrydata coverage diff A.json B.json`): required arguments, basic behavior, version compatibility checks and exit-code semantics when coverage regressions are detected.
- [KR4] Cross-link from the core README coverage section to the reporter coverage/diff documentation so that users can discover the diff workflow from either side.

### Deliverables

- [DEL1] Updated `packages/reporter/README.md` containing a high-level description of `coverage-report/v1` and a small example snippet that matches the shared coverage report spec.
- [DEL2] Documentation for the coverage diff CLI that shows at least one concrete command and explains its output, exit codes and version-compatibility rules.
- [DEL3] Cross-links between the core README coverage section and the reporter documentation, enabling navigation from core coverage usage to reporting/diff tooling and back.

### Definition of Done

- [DOD1] The reporter README accurately reflects the `coverage-report/v1` structure and semantics (including thresholds and `coverageStatus`) as defined in the coverage-aware spec.
- [DOD2] All documented CLI commands for generating coverage reports or running coverage diffs match the actual CLI flags, behavior and exit codes.
- [DOD3] Cross-links between core and reporter docs are present and stable, so that a user starting from either side can discover coverage-report/v1 details and diff workflows.

### Test Strategy

- [TS1] Manual doc review against the coverage-aware spec (sections on JSON coverage report and thresholds) and the implemented CoverageReport type to ensure the reporter README stays aligned.
- [TS2] A small script or CI check that runs the coverage diff CLI on two fixture reports and confirms that the documented command line and exit-code semantics match reality.

## Mapping 9323 subtasks → parent bullets

- **9323.9323001 – Describe coverage-report/v1 in reporter README**  
  Covers: [KR1], [DEL1], [DOD1], [TS1]. Status: covered (reporter README now includes a dedicated coverage-report/v1 overview and example fragment aligned with the shared CoverageReport type and coverage-aware spec).

- **9323.9323002 – Document coverage diff CLI usage**  
  Covers: [KR3], [DEL2], [DOD2], [TS2]. Status: pending.

- **9323.9323003 – Add cross-links between core README and reporter docs**  
  Covers: [KR2], [KR4], [DEL3], [DOD3]. Status: pending.
