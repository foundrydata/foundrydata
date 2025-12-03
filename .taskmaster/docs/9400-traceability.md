# Traceability — Task 9400 (Formalize Generator vs Repair contract and G_valid v1 in canonical spec)

This document maps the parent task 9400 bullets from Implementation Details, Deliverables and Test Strategy to its subtasks 9400.9400001–9400.9400004.

## Parent bullets

### Implementation Details

- [KR1] Canonical SPEC describes a normative “Generator vs Repair contract” section that clarifies responsibilities for each phase over the 5‑stage pipeline.
- [KR2] G_valid v1 scope is defined (simple objects and simple arrays with `items`+`contains`, without AP:false/unevaluated* interplay) together with the meaning of “AJV‑valid by construction” for structural validity.
- [KR3] Outside G_valid, the existing “minimal witness + bounded Repair” regime is restated explicitly as the default behaviour.
- [KR4] The UUID + `contains` motif is documented as a reference example for the Generator/Repair contract and G_valid v1.

### Deliverables

- [DEL1] Updated `docs/spec-canonical-json-schema-generator.md` (sections §6/§9/§10) with the Generator vs Repair contract, G_valid definitions and cross‑references.
- [DEL2] Updated `ARCHITECTURE.md`, `docs/Invariants.md`, `docs/Known-Limits.md` and `docs/COMPREHENSIVE_FEATURE_SUPPORT.md` so they are consistent with the canonical SPEC on the Generator/Repair boundary and G_valid v1.
- [DEL3] Internal/spec review of the new contract text and example to confirm it matches what can be implemented without breaking existing invariants.

### Definition of Done

- [DOD1] Canonical SPEC and architecture docs expose a consistent Generator vs Repair contract and G_valid v1 scope, with no conflicting wording elsewhere in the docs.
- [DOD2] Invariants and known limits clearly state what is guaranteed (and what is not) for G_valid v1, including which Repair actions are allowed or forbidden in this zone.
- [DOD3] The UUID + `contains` motif is captured as a canonical example that is referenced from both SPEC and architecture/feature docs.

### Test Strategy

- [TS1] Spec review checklist covering presence of the new section, correctness of the G_valid v1 scope and description of allowed/forbidden Repair actions.
- [TS2] Consistency pass between canonical SPEC, ARCHITECTURE.md, COMPREHENSIVE_FEATURE_SUPPORT.md, Invariants.md and Known-Limits.md.
- [TS3] Internal review with generator/repair owners to confirm the wording matches what can be implemented without breaking existing invariants.

## Mapping 9400 subtasks → parent bullets

- **9400.9400001 – Add Generator vs Repair contract and G_valid section to canonical spec**  
  Covers: [KR1, KR2, KR3, KR4, DEL1, DOD1, TS1, TS3] (status: covered).

- **9400.9400002 – Align ARCHITECTURE.md with the new contract**  
  Covers: [KR1, KR2, KR3, DEL2, DOD1, TS2] (status: covered).

- **9400.9400003 – Extend invariants and known limits with G_valid guarantees**  
  Covers: [KR2, KR3, DEL2, DOD2, TS2] (status: covered).

- **9400.9400004 – Document UUID + contains pattern as reference example**  
  Covers: [KR4, DEL2, DEL3, DOD3, TS1, TS3] (status: covered).
