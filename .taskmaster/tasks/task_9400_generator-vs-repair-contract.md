# Task ID: 9400

**Title:** Formalize Generator vs Repair contract and G_valid v1 in canonical spec

**Status:** pending

**Dependencies:** None

**Priority:** high

**Description:** Introduce the Generator vs Repair contract and the G_valid (Generator-valid) zone into the canonical SPEC.

**Details:**

[Context]
The canonical spec and architecture describe the 5-stage pipeline but leave the Generator vs Repair boundary implicit.
Aligns with spec §6 (High-Level Architecture), §9 (Generator) and §10 (Repair Engine), and introduces a new subsection under §6 for the Generator / Repair contract and generator-valid zone (G_valid).

[Key requirements]
- Add a normative "Generator vs Repair contract" subsection to the generator/repair sections.
- Define G_valid v1 scope (simple objects, simple arrays with items+contains, no AP:false/unevaluated* interplay) and the meaning of "AJV-valid by construction" (structural validity with only numeric/format nudges left to Repair).
- State explicitly that outside G_valid the existing "minimal witness + bounded Repair" regime remains in force.
- Document the UUID + contains example as a reference motif.

[Deliverables]
- Updated docs/spec-canonical-json-schema-generator.md (spec §6/§9/§10), ARCHITECTURE.md and Invariants/Known-Limits with the new contract.

**Test Strategy:**

- Spec review checklist covering: presence of the new section, correct G_valid v1 scope, explicit description of allowed/forbidden Repair actions.
- Consistency pass between canonical spec, ARCHITECTURE.md, COMPREHENSIVE_FEATURE_SUPPORT.md and Invariants.md.
- Internal review with generator/repair owners to confirm the wording matches what can be implemented without breaking existing invariants.

## Subtasks

### 9400.9400001. Add Generator vs Repair contract and G_valid section to canonical spec

**Status:** pending  
**Dependencies:** None  

Draft the new section in docs/spec-canonical-json-schema-generator.md and link it from the Generator (spec §9) and Repair (spec §10) chapters.

### 9400.9400002. Align ARCHITECTURE.md with the new contract

**Status:** pending  
**Dependencies:** None  

Update ARCHITECTURE.md so that the Generate and Repair stage descriptions explicitly reference the Generator vs Repair contract and G_valid zones (spec §6 overview, §6.x new subsection).

### 9400.9400003. Extend invariants and known limits with G_valid guarantees

**Status:** pending  
**Dependencies:** None  

Add a short list of G_valid invariants and non-goals to Invariants.md and Known-Limits.md, including what Repair is allowed to do inside G_valid zones, referencing spec §6.4–§6.6.

### 9400.9400004. Document UUID + contains pattern as reference example

**Status:** pending  
**Dependencies:** None  

Write a self-contained example for the UUID + contains pattern that illustrates the change from minimal-witness generation with Repair filling required fields to G_valid generation where the Generator produces a fully valid item, aligned with spec §6.3.2.
