# Traceability — Task 9604 (Deliver reporter/platform view and CI gates)

This document maps parent task 9604 bullets from Implementation Details, Deliverables, DoD and Test Strategy to its subtasks 9604.9604001–9604.9604005.

## Parent bullets

### Implementation Details

- [KR1] Derived Reporter/Platform View `reporter-platform-view/v1` built strictly from diag + coverage-report/v1, with comparability metadata (seed, registryFingerprint, coverage scope).
- [KR2] Repair usage observability: stable-sorted `repairUsageByMotif` with invariants (non-negative, itemsWithRepair ≤ items, actions==0 ⇒ itemsWithRepair==0).
- [KR3] Coverage planning comparability: surface planned/unplanned totals and plannerCapsHit entries; carry operationsScope/selectedOperations sorted.
- [KR4] CI gates: fatal/warn handling, coverage thresholds, guided≥measure invariant, exclusion of SLIs from determinism checks.

### Deliverables

- [DEL1] Reporter/Platform View builder + schema aligned with Appendix A.
- [DEL2] CI gate engine and fixtures exercising KPIs from diag + coverage-report.
- [DEL3] Traceability tests/docs linking gates and view fields to spec anchors.

### Definition of Done

- [DOD1] Derived view validated against schema; no new semantics beyond diag/coverage-report/v1.
- [DOD2] Gates covered by automated tests and run in the build/typecheck/lint/test/bench chain.
- [DOD3] Comparability rules enforced (fingerprint/ops scope) to avoid misleading diffs; outputs deterministic metrics-only.

### Test Strategy

- [TS1] Unit/integration tests for platform view derivation, stable sorting, and plannerCapsHit aggregation.
- [TS2] Gate engine tests covering fatal/warn escalation, coverage thresholds, guided≥measure invariants, and SLIs exclusion.
- [TS3] Comparability/diff tests for registryFingerprint and operationsScope/selectedOperations.

## Mapping 9604 subtasks → parent bullets

- **9604.9604001 – Implement Reporter/Platform View derivation**  
  Covers: [KR1, KR2, KR3, DEL1, DOD1, TS1] (status: done).

- **9604.9604002 – Add CI gate engine for observability KPIs**  
  Covers: [KR4, DEL2, DOD2, TS2] (status: done).

- **9604.9604003 – Traceability and test suite for gates**  
  Covers: [KR4, DEL3, DOD2, TS2, TS3] (status: done).

- **9604.9604004 – Add schema + validation for Reporter/Platform View**  
  Covers: [KR1, DEL1, DOD1, TS1] (status: done).

- **9604.9604005 – Wire operationsScope/selectedOperations into coverage report**  
  Covers: [KR3, DEL1, DOD3, TS3] (status: pending).
