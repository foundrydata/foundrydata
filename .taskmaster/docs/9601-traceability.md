# Traceability — Task 9601 (Enforce coverage-report observability invariants and planner caps audit)

This document maps parent task 9601 bullets from Implementation Details, Deliverables, DoD and Test Strategy to its subtasks 9601.9601001–9601.9601004.

## Parent bullets

### Implementation Details

- [KR1] Planner caps audit: `coverage-report/v1` retains all targets under caps with `meta.planned:false` and surfaces deterministic `diagnostics.plannerCapsHit` entries per `(dimension, scopeType, scopeKey)` with `{totalTargets, plannedTargets, unplannedTargets}`.
- [KR2] Guided vs measure invariants: for fixed seeds/options, `coverage=guided` never underperforms `coverage=measure` on branches/enums and keeps stable target IDs.
- [KR3] Coverage-report observability fields (planned/unplanned, caps, hints) remain schema-valid and self-consistent across report modes.
- [KR4] Comparability metadata (registryFingerprint, operationsScope, selectedOperations) propagates into reports/diffs and blocks incompatible comparisons.

### Deliverables

- [DEL1] Coverage planner caps tagging and diagnostics reflected in coverage-report/v1 and CLI summary.
- [DEL2] Regression tests for guided≥measure invariants on branches/enums plus target ID stability.
- [DEL3] Schema validation and diff/compat enforcement for observability metadata, including comparability.

### Definition of Done

- [DOD1] Coverage reports show capped targets with `planned:false`, valid `plannerCapsHit` aggregates, and pass coverage-report schema (including observability fields).
- [DOD2] Build → typecheck → lint → test → bench chain rerun with observability invariants validated for touched areas.
- [DOD3] Guided/measure diffs and comparability checks fail fast when metadata mismatches, avoiding misleading reports.

### Test Strategy

- [TS1] Fixture/E2E coverage-report snapshots under planner caps verifying `meta.planned:false`, stable target IDs and `plannerCapsHit` aggregates.
- [TS2] Dual-run regression tests (measure vs guided) asserting guided≥measure on branches/enums and stable target IDs.
- [TS3] Schema/diff compatibility tests covering observability fields and comparability metadata, rejecting mismatches.

## Mapping 9601 subtasks → parent bullets

- **9601.9601001 – Tag planned/unplanned targets under planner caps**  
  Covers: [KR1, DEL1, DOD1, DOD2, TS1] (status: done).

- **9601.9601002 – Add guided vs measure invariance regression tests**  
  Covers: [KR2, DEL2, DOD2, TS2] (status: done).

- **9601.9601003 – Validate coverage-report/v1 schema with observability fields**  
  Covers: [KR3, DEL3, DOD1, DOD2, TS3] (status: done).

- **9601.9601004 – Emit and enforce comparability metadata for diffs**  
  Covers: [KR4, DEL3, DOD3, TS3] (status: done). Scope: propagate `registryFingerprint` + operations comparability into coverage-report/v1, normalize/deduplicate `selectedOperations`, carry `operationsScope` from pipeline options into run metadata, reject incompatible diffs, and validate schema when operations selections are present.

- **9601.9601005 – Enforce coverage diff compatibility for coverage settings**  
  Covers: [KR4, DEL3, DOD3, TS3] (status: done). Scope: block coverage diffs when `dimensionsEnabled` or `excludeUnreachable` differ, extend compatibility checks/tests accordingly without altering coverage-report payloads.
