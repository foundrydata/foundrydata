# Traceability — Task 9402 (Make array generation G_valid-aware for items + contains motifs)

This document maps the parent task 9402 bullets from Implementation Details, Deliverables and Test Strategy to its subtasks 9402.9402001–9402.9402004.

## Parent bullets

### Implementation Details

- [KR1] Generator can distinguish G_valid vs non-G_valid array motifs (items+contains vs legacy/complex) using the classification index.
- [KR2] In G_valid arrays, elements satisfying `contains` also satisfy the effective `items` schema and required properties by construction.
- [KR3] Non-G_valid arrays (AP:false, complex contains bags, uniqueItems-heavy cases) preserve existing generation and Repair behavior.
- [KR4] Determinism and existing contains-related diagnostics/caps (e.g. CONTAINS_BAG_COMBINED, CONTAINS_UNSAT_BY_SUM) are preserved for all modes.

### Deliverables

- [DEL1] Generator wiring updated so array generation paths can see G_valid motif information for their canonPaths.
- [DEL2] Updated array generation logic for G_valid items+contains motifs, producing AJV-valid-by-construction elements.
- [DEL3] Fixtures and tests documenting G_valid vs legacy array behavior, including golden snapshots where appropriate.

### Definition of Done

- [DOD1] Arrays in G_valid motifs (simple items+contains) are generated in a way that satisfies both `items` and `contains` without requiring structural Repair.
- [DOD2] Arrays outside G_valid motifs keep baseline semantics and diagnostics, with no regressions in existing tests.
- [DOD3] Tests cover representative G_valid motifs and non-G_valid edge cases for arrays, including determinism under fixed seeds.

### Test Strategy

- [TS1] Unit tests for array generation in G_valid motifs, asserting AJV validity and minimal Repair involvement.
- [TS2] Edge-case tests for AP:false, complex contains bags, unevaluatedItems/unevaluatedProperties and uniqueItems-heavy arrays.
- [TS3] Property-style tests comparing pre/post behavior for non-G_valid arrays to ensure no regressions in validity or determinism.
- [TS4] Pipeline-level tests showing that enabling/disabling the G_valid feature flag does not affect behavior for non-G_valid arrays.

## Mapping 9402 subtasks → parent bullets

- **9402.9402001 – Plumb G_valid hints into array generation paths**  
  Covers: [KR1, KR4, DEL1, DOD1, TS4] (status: done).

- **9402.9402002 – Implement combined items + contains generation for G_valid arrays**  
  Covers: [KR1, KR2, KR3, KR4, DEL2, DOD1, DOD2, TS1, TS2, TS4] (status: done).

- **9402.9402003 – Add fixtures for G_valid array motifs**  
  Covers: [KR2, KR3, DEL3, DOD2, TS2] (status: done).

- **9402.9402004 – Write tests for G_valid arrays and golden snapshots**  
  Covers: [KR2, KR3, KR4, DEL3, DOD2, DOD3, TS1, TS2, TS3, TS4] (status: pending).
