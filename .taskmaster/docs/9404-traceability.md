# Traceability — Task 9404 (Constrain Repair behavior inside G_valid zones and surface violations)

This document maps the parent task 9404 bullets from Implementation Details, Deliverables and Test Strategy to its subtasks 9404.9404001–9404.9404003.

## Parent bullets

### Implementation Details

- [KR1] Repair engine can consult per-path G_valid motif information derived from the classification index and effective schema view.
- [KR2] In G_valid zones, structural Repair actions (adding required properties, synthesizing sub-objects/arrays) are treated as contract violations rather than routine behavior.
- [KR3] Non-structural Repair actions (numeric nudges, uniqueItems de-duplication, format tweaks) remain allowed in G_valid zones as long as AJV validity is preserved.
- [KR4] Outside G_valid zones, Repair behavior and diagnostics (including UNSAT_BUDGET_EXHAUSTED) remain unchanged and deterministic.

### Deliverables

- [DEL1] Repair engine wiring updated so per-path G_valid motif information is available to AJV-driven Repair routines.
- [DEL2] Guards implemented to restrict or flag structural Repair actions in G_valid zones, including per-action metadata.
- [DEL3] Tests and diagnostics documenting how Repair surfaces G_valid contract violations and preserves legacy behavior elsewhere.

### Definition of Done

- [DOD1] Structural Repair actions in G_valid zones are either avoided or surfaced explicitly as contract violations via diagnostics/metrics.
- [DOD2] Non-G_valid locations keep baseline Repair semantics and diagnostics, with no regressions in existing tests.
- [DOD3] Tests cover representative G_valid object/array motifs and non-G_valid edge cases for Repair, including budget exhaustion paths.

### Test Strategy

- [TS1] Unit tests simulating AJV errors on G_valid paths that would trigger structural fixes, asserting that Repair surfaces these as violations.
- [TS2] Integration tests mixing G_valid and non-G_valid paths to verify that only G_valid zones change behavior while non-G_valid zones keep baseline Repair behavior.
- [TS3] Tests validating that numeric/format tweaks and uniqueItems de-duplication still run in G_valid zones and that a feature flag can relax constraints deterministically.

## Mapping 9404 subtasks → parent bullets

- **9404.9404001 – Wire G_valid motif information into Repair engine**  
  Covers: [KR1, DEL1, DOD1, TS1] (status: done).

- **9404.9404002 – Restrict structural Repair actions in G_valid zones**  
  Covers: [KR2, KR3, DEL2, DOD1, DOD2, TS1, TS2] (status: done).

- **9404.9404003 – Add tests and diagnostics for G_valid Repair violations**  
  Covers: [KR2, KR3, DEL3, DOD2, DOD3, TS2, TS3] (status: done).
