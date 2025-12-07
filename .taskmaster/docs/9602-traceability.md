# Traceability — Task 9602 (Surface repair-tier and G_valid observability metrics)

This document maps parent task 9602 bullets from Implementation Details, Deliverables, DoD and Test Strategy to its subtasks 9602.9602001–9602.9602003.

## Parent bullets

### Implementation Details

- [KR1] Repair tier observability: deterministic counters `repair_tier{1,2,3}_actions`, `repair_tierDisabled` and diagnostics `REPAIR_TIER_DISABLED`/`REPAIR_GVALID_STRUCTURAL_ACTION`.
- [KR2] G_valid motif metrics: `gValid_<motif>_{items,itemsWithRepair,actions}` surfaced in `diag.metrics`, keeping observability passive.
- [KR3] Coverage independence: repair observability must not depend on coverage settings or mutate core outputs.

### Deliverables

- [DEL1] Metrics collector updates for repair tiers and G_valid motifs aligned with diag schema.
- [DEL2] Diagnostics schema/tests for policy blocks and G_valid structural actions.
- [DEL3] Regression tests asserting counters/diagnostics and independence from coverage.

### Definition of Done

- [DOD1] Repair/G_valid metrics present and validated by diag-schema; tiers blocked policies surfaced.
- [DOD2] Build → typecheck → lint → test → bench rerun with observability invariants checked.
- [DOD3] Repair observability proven coverage-independent via tests/fixtures.

### Test Strategy

- [TS1] Unit tests on metrics collector/repair usage to assert counters and payloads.
- [TS2] Integration tests for tier policies and G_valid structural actions (diagnostics).
- [TS3] E2E/regression showing coverage toggles do not change repair observability outputs.

## Mapping 9602 subtasks → parent bullets

- **9602.9602001 – Add G_valid motif metrics to metrics collector**  
  Covers: [KR2, DEL1, DOD1, DOD2, TS1] (status: done).

- **9602.9602002 – Harden repair tier counters and diagnostics**  
  Covers: [KR1, DEL1, DEL2, DOD1, TS2] (status: done).

- **9602.9602003 – Add observability regression tests for repair/G_valid metrics**  
  Covers: [KR1, KR2, KR3, DEL3, DOD2, DOD3, TS3] (status: done).  
  Notes: Aligned G_valid metrics to spec naming (`gValid_arrayContainsSimple_*`) and per-element counting while keeping coverage/metrics toggles deterministic.
