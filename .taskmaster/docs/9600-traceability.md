# Traceability — Task 9600 (Align diag.metrics baseline with observability spec)

This document maps the parent task 9600 bullets from Implementation Details, Deliverables, DoD and Test Strategy to its subtasks 9600.9600001–9600.9600004.

## Parent bullets

### Implementation Details

- [KR1] Baseline `diag.metrics` keys (phase timings, deterministic counters, benchmark SLIs) match the observability SPEC and are typed consistently across core/shared/reporter.
- [KR2] Metrics on/off behavior stays side-effect free: deterministic counters remain stable, and environment-dependent SLIs are isolated from determinism comparisons.
- [KR3] Metrics payloads preserve phase tagging/envelope rules and remain passive (no control-flow impact), including future reporter/platform consumers.

### Deliverables

- [DEL1] Shared schema/types + validator for `diag.metrics` updated to the SPEC baseline and propagated to all packages.
- [DEL2] Regression tests proving metrics toggle does not alter pipeline outputs/diagnostics.
- [DEL3] Determinism comparator and reporting logic that exclude non-deterministic SLIs while keeping deterministic counters enforced.

### Definition of Done

- [DOD1] `diag.metrics` baseline keys are present/typed with consistent zero/absent policy when metrics are disabled, and schema validation passes.
- [DOD2] Metrics toggle and determinism comparators are validated by tests; no behavioral drift when metrics are enabled vs disabled for fixed seeds.
- [DOD3] Build/typecheck/lint/test/bench chain remains green with updated observability contracts and reporter outputs.

### Test Strategy

- [TS1] Unit tests for metrics collector/types/validators covering required keys and strict numeric validation.
- [TS2] E2E/regression tests comparing metrics-on vs metrics-off outputs to demonstrate passivity.
- [TS3] Determinism comparator tests ensuring SLIs (p50/p95/memory) are ignored while deterministic counters remain checked.

## Mapping 9600 subtasks → parent bullets

- **9600.9600001 – Update diag.metrics schema/types for required keys**  
  Covers: [KR1, DEL1, DOD1, TS1] (status: done).

- **9600.9600002 – Implement deterministic metrics collection and SLI separation**  
  Covers: [KR1, KR2, DEL1, DEL2, DOD2, TS1, TS2] (status: done).
  - Update: instrumented branchTrialsTried + evalTrace counters and averaged repairActionsPerRow; added regression coverage for metrics observability and collector eval-trace aggregation.

- **9600.9600003 – Add side-effect-free regression tests for metrics toggle**  
  Covers: [KR2, DEL2, DOD2, TS2] (status: done).

- **9600.9600004 – Determinism comparator: ignore non-deterministic metrics**  
  Covers: [KR3, DEL3, DOD2, DOD3, TS3] (status: done). Comparator helper strips diagnostic metrics and filters timings/SLIs from snapshots; metrics-toggle test now compares outputs/diagnostics with metrics excluded and keeps explicit assertions on metrics behavior.

- **9600.9600005 – Add coverage-mode metrics toggle regression**  
  Covers: [KR2, DEL2, DOD2, TS2] (status: in-progress → done). Adds a coverage=measure metrics toggle regression ensuring outputs/diagnostics match with metrics on/off and normalizes non-deterministic coverage report timing fields for strict equality.

- **9600.9600006 – Metrics flag propagation and deterministic comparator**  
  Covers: [KR1, KR2, DEL1, DEL2, DOD1, DOD2, TS2, TS3] (status: done). Propagates PlanOptions.metrics into metrics collection, persists metricsEnabled across pipeline/coverage/reporter surfaces, and excludes nameEnumElapsedMs from determinism comparisons with supporting tests.
