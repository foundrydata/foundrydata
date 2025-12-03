# Traceability — Task 9401 (Implement motif classification and G_valid zoning in core pipeline)

This document maps the parent task 9401 bullets from Implementation Details, Deliverables and Test Strategy to its subtasks 9401.9401001–9401.9401004.

## Parent bullets

### Implementation Details

- [KR1] Internal motif representation defines a small, explicit set of motif types (e.g. simple object with required, simple array with items+contains, AP:false must-cover, complex contains) plus a G_valid flag.
- [KR2] A classifier over canonical/Compose artifacts marks each canonPath with motif + G_valid without re-parsing the original schema.
- [KR3] v1 exclusions (AP:false + CoverageIndex, unevaluated*, complex contains bags, deep conditionals) are respected so that only baseline-safe locations are marked G_valid.
- [KR4] Motif and G_valid information is exposed to generator, repair and metrics via a cheap lookup in the execution context, with a feature flag to disable enforcement when needed.

### Deliverables

- [DEL1] New core module for motif classification (types + classifier API) in `packages/core/src/transform/g-valid-classifier.ts`.
- [DEL2] Generator/Repair wiring and metrics updated to consume motif + G_valid information.
- [DEL3] Tests and docs describing which motifs are considered G_valid vs non-G_valid and how the feature flag affects behavior.

### Definition of Done

- [DOD1] Motif classification and G_valid zoning are implemented and wired into the core pipeline without changing behaviour when the feature flag is off.
- [DOD2] Baseline motifs (simple objects, simple arrays items+contains) are classified as G_valid v1; excluded motifs remain non-G_valid.
- [DOD3] Tests cover classification for the key motifs and edge cases mentioned in the parent description.

### Test Strategy

- [TS1] Unit tests that feed canonical schemas + Compose outputs and assert motif + G_valid classification per canonPath.
- [TS2] Edge-case tests for AP:false + propertyNames/patternProperties, unevaluatedProperties/unevaluatedItems and multi-contains bags.
- [TS3] Stability tests showing classification is deterministic for fixed inputs and insensitive to allOf branch ordering.
- [TS4] Smoke tests proving that when the feature flag is off, pipeline behavior matches the current baseline.

## Mapping 9401 subtasks → parent bullets

- **9401.9401001 – Design G_valid motif types and internal API**  
  Covers: [KR1, DEL1, TS1] (status: in-progress).

- **9401.9401002 – Implement classifier over Compose artifacts**  
  Covers: [KR1, KR2, KR3, DEL1, DEL3, DOD1, DOD2, TS1, TS2, TS3] (status: pending).

- **9401.9401003 – Wire classifier into generator and repair planning**  
  Covers: [KR1, KR2, KR4, DEL2, DOD1, TS4] (status: pending).

- **9401.9401004 – Add tests for motif classification**  
  Covers: [KR1, KR2, KR3, DEL3, DOD2, DOD3, TS1, TS2, TS3, TS4] (status: pending).

