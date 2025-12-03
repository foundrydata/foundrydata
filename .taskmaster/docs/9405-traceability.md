# Traceability — Task 9405 (Add repair usage metrics and G_valid motif observability)

This document maps the parent task 9405 bullets from Implementation Details, Deliverables and Test Strategy to its subtasks 9405.9405001–9405.9405004.

## Parent bullets

### Implementation Details

- [KR1] Define a metrics model for repair usage per motif, including motif id, total items, itemsWithRepair, actions and G_valid flag.
- [KR2] Tag Repair actions with canonPath, motif and G_valid state, and aggregate usage data at run end.
- [KR3] Integrate motif-level repair usage metrics into the existing metrics model and snapshots, aligned with spec metrics sections.
- [KR4] Ensure that G_valid zones exhibit little or no structural Repair in nominal cases and that any drift is observable in metrics and tests.

### Deliverables

- [DEL1] Types and data structures describing motif-level repair usage metrics integrated into the metrics model.
- [DEL2] Repair engine instrumentation emitting motif-tagged usage events for structural and non-structural actions.
- [DEL3] Pipeline-level aggregation and exposure of repair usage metrics through metrics snapshots and, when relevant, diagnostics.
- [DEL4] E2E tests and traceability entries for G_valid motifs asserting low structural Repair usage and documenting invariants.

### Definition of Done

- [DOD1] Motif-level repair usage metrics (including G_valid flag) are defined and available in metrics snapshots.
- [DOD2] Repair usage inside and outside G_valid zones is observable and testable via metrics and diagnostics.
- [DOD3] Tests cover representative G_valid motifs and non-G_valid edge cases for repair usage, including regression detection via golden metrics snapshots.

### Test Strategy

- [TS1] Unit tests for the metrics collector and motif-level aggregation logic, verifying correct counts and G_valid tagging.
- [TS2] Integration tests mixing G_valid and non-G_valid motifs to verify that structural Repair counts are low/zero in G_valid zones and baseline elsewhere.
- [TS3] Golden tests on metrics snapshots detecting regressions in repair usage over time and validating the new motif family in tests-traceability docs.

## Mapping 9405 subtasks → parent bullets

- **9405.9405001 – Define repair usage metrics model by motif and G_valid flag**  
  Covers: [KR1, DEL1, DOD1, TS1] (status: done).

- **9405.9405002 – Instrument Repair to emit motif-tagged usage events**  
  Covers: [KR1, KR2, DEL2, DOD1, DOD2, TS1, TS2] (status: done).

- **9405.9405003 – Aggregate and expose repair usage metrics in pipeline orchestrator**  
  Covers: [KR2, KR3, DEL3, DOD2, TS2, TS3] (status: pending).

- **9405.9405004 – Add G_valid no-repair e2e tests and traceability entries**  
  Covers: [KR4, DEL4, DOD3, TS2, TS3] (status: pending).
