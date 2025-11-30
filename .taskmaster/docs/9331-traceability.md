# Traceability — Task 9331 (Extract a dedicated coverage runtime from the pipeline orchestrator)

This document maps the parent task 9331 bullets from Implementation Details, Deliverables, Definition of Done and Test Strategy to its subtasks 9331.9331001–9331.9331003.

## Parent bullets

### Implementation Details

- [KR1] Introduce a small internal API (coverage runtime) that takes canonical schema, Compose artifacts, resolved coverage options and generator outcomes, then returns coverageTargets, coverageMetrics, coverageReport and any planner diagnostics.
- [KR2] Move Analyzer + Planner + accumulator + Evaluator wiring into this runtime, preserving existing options semantics (mode, dimensionsEnabled, excludeUnreachable, minCoverage, reportMode) and determinism guarantees.
- [KR3] Keep executePipeline responsible for phase sequencing and diagnostics envelope enforcement, but make coverage a clearly separated phase after Validate.

### Deliverables

- [DEL1] New module encapsulating coverage orchestration and hooks.
- [DEL2] executePipeline updated to call this module when coverage is enabled, with no behavior change visible to existing tests or CLI.

### Definition of Done

- [DOD1] All existing tests involving coverage (core, e2e, CLI) pass unchanged after the refactor.
- [DOD2] New tests validate that the coverage runtime API is stable and enforces the same invariants as before (gating, determinism, thresholds, reportMode).

### Test Strategy

- [TS1] Unit tests for the new coverage runtime module with synthetic inputs (CoverageTargets, generator items, coverage options) to assert metrics, report arrays and unsatisfiedHints wiring.
- [TS2] Extended pipeline-orchestrator tests confirming that executePipeline status, stages and artifacts (including coverageReport and coverageMetrics) remain identical before/after the refactor.
- [TS3] Existing coverage end-to-end and CLI tests are run to ensure no regressions.

## Mapping 9331 subtasks → parent bullets

- **9331.9331001 – Introduce coverage runtime helper module**  
  Covers: [KR1, KR2, DEL1, TS1] (status: covered).

- **9331.9331002 – Refactor executePipeline to use coverage runtime**  
  Covers: [KR3, DEL2, TS2] (status: covered).

- **9331.9331003 – Add tests for coverage runtime wiring**  
  Covers: [DOD1, DOD2, TS3] (status: covered).
