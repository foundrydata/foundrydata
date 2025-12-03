# Task ID: 9403

**Title:** Make object generation G_valid-aware for simple required/properties motifs

**Status:** pending

**Dependencies:** 9401

**Priority:** high

**Description:** Adjust object generation so that, in G_valid zones, the Generator satisfies required properties and basic bounds without relying on Repair to synthesize placeholder values.

**Details:**

[Context]
For simple objects without AP:false/unevaluated* and with clear properties/required constraints, the Generator should produce AJV-valid instances on its own, leaving only numeric/format tweaks to Repair.
Aligns with spec §6.3.1 (objects without hard evaluation guards) and §9 (Generator obligations).

[Key requirements]
- For objects marked G_valid:
  - always emit all required properties from the effective schema,
  - respect basic type/enum/const bounds using existing helpers,
  - avoid depending on Repair to create whole sub-objects or required scalars.
- Leave behavior unchanged for AP:false, unevaluated* or complex conditional motifs.
- Preserve determinism for non-G_valid objects as mandated by spec §3 and §9.

**Test Strategy:**

- Unit tests on simple object fixtures asserting that G_valid objects contain all required properties with non-empty values before Repair.
- Integration tests mixing G_valid and non-G_valid objects to verify that only G_valid ones change behavior and still pass AJV, while others keep baseline behavior.
- Negative tests with intentionally unsatisfiable schemas to confirm diagnostics remain clear and consistent.

## Subtasks

### 9403.9403001. Wire G_valid hints into object generation paths

**Status:** pending  
**Dependencies:** None  

Inject G_valid motif information into object generation routines to choose between G_valid and legacy minimal-witness strategies, following spec §6.4.

### 9403.9403002. Implement minimal-but-valid object construction for G_valid motifs

**Status:** pending  
**Dependencies:** None  

Implement logic ensuring all required properties and basic constraints are satisfied for G_valid objects, reusing existing rational/enum helpers, consistent with spec §6.3.1 and §9.

### 9403.9403003. Add fixtures and tests for G_valid objects

**Status:** pending  
**Dependencies:** None  

Create schemas and tests that verify G_valid object behavior (including nested required properties) while AP:false/unevaluated* cases remain unchanged, per spec §6.3.1.
