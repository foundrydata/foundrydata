# Traceability — Task 9403 (Make object generation G_valid-aware for simple required/properties motifs)

This document maps the parent task 9403 bullets from Implementation Details, Deliverables and Test Strategy to its subtasks 9403.9403001–9403.9403003.

## Parent bullets

### Implementation Details

- [KR1] Generator can distinguish G_valid vs non-G_valid object motifs using the classification index and effective schema view.
- [KR2] In G_valid objects, required properties and basic bounds (type/enum/const) are satisfied by the Generator without structural Repair.
- [KR3] Non-G_valid objects (with AP:false, unevaluated* or complex conditionals) preserve existing generation and Repair behavior.
- [KR4] Determinism and existing diagnostics for objects are preserved for all modes and motifs.

### Deliverables

- [DEL1] Generator wiring updated so object generation paths can see G_valid motif information for their canonPaths.
- [DEL2] Updated object generation logic for G_valid motifs, producing minimal-but-valid instances that satisfy required/properties constraints.
- [DEL3] Fixtures and tests documenting G_valid vs legacy object behavior, including mixed scenarios with non-G_valid motifs.

### Definition of Done

- [DOD1] Objects in G_valid motifs are generated with all required properties present and structurally AJV-valid before Repair.
- [DOD2] Objects outside G_valid motifs keep baseline semantics and diagnostics, with no regressions in existing tests.
- [DOD3] Tests cover representative G_valid motifs and non-G_valid edge cases for objects, including determinism under fixed seeds.

### Test Strategy

- [TS1] Unit tests for object generation in G_valid motifs, asserting presence of required properties and validity before Repair.
- [TS2] Integration tests mixing G_valid and non-G_valid objects to verify that only G_valid behavior changes and all instances remain AJV-valid.
- [TS3] Negative tests with unsatisfiable schemas to confirm diagnostics remain clear and consistent for objects.

## Mapping 9403 subtasks → parent bullets

- **9403.9403001 – Wire G_valid hints into object generation paths**  
  Covers: [KR1, KR4, DEL1, DOD1, TS1] (status: done).

- **9403.9403002 – Implement minimal-but-valid object construction for G_valid motifs**  
  Covers: [KR1, KR2, KR4, DEL2, DOD1, TS1, TS2] (status: done).

- **9403.9403003 – Add fixtures and tests for G_valid objects**  
  Covers: [KR2, KR3, DEL3, DOD2, DOD3, TS2, TS3] (status: pending).
