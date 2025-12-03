# Task ID: 9402

**Title:** Make array generation G_valid-aware for items + contains motifs

**Status:** pending

**Dependencies:** 9401

**Priority:** high

**Description:** Update array generation so that, in G_valid zones, items satisfying contains also respect the effective items schema and are AJV-valid by construction.

**Details:**

[Context]
The current array generator enforces contains bags but may emit minimal witnesses that rely on Repair to fill required fields. In G_valid arrays (simple items + contains, no AP:false/unevaluated*), the Generator must produce elements that satisfy both items and contains subschemas without structural Repair.
Aligns with spec §6.3.2 (arrays with simple items+contains in G_valid) and §9 (Generator obligations in G_valid zones).

[Key requirements]
- For canonPaths marked G_valid with items + contains:
  - generate targeted elements against the effective items schema AND the contains subschema,
  - ensure required properties and referenced shapes in items are satisfied by the Generator.
- Preserve existing behavior for non-G_valid motifs (AP:false, complex bags, heavy uniqueItems).
- Keep determinism and existing contains diagnostics/caps (e.g. CONTAINS_BAG_COMBINED, CONTAINS_UNSAT_BY_SUM) as described in spec §8/§9.

**Test Strategy:**

- Unit tests for G_valid array schemas asserting that generated elements already satisfy required properties and refs before Repair.
- Fixtures including the UUID + contains pattern and golden snapshots comparing pre/post behavior.
- Integration tests verifying that non-G_valid arrays keep identical behavior and diagnostics to the baseline.
- Property-style tests comparing AJV validity before/after changes to ensure no regressions and preserved determinism for non-G_valid motifs.

## Subtasks

### 9402.9402001. Plumb G_valid hints into array generation paths

**Status:** pending  
**Dependencies:** None  

Inject G_valid motif information into array generation code paths to select between G_valid and legacy strategies, respecting spec §6.4 and §9 deterministic behavior.

### 9402.9402002. Implement combined items + contains generation for G_valid arrays

**Status:** pending  
**Dependencies:** None  

Implement logic that, for G_valid arrays, generates elements satisfying both the effective items schema and the contains subschema, reusing existing planning/composition outputs and honoring spec §6.3.2.

### 9402.9402003. Add fixtures for G_valid array motifs

**Status:** pending  
**Dependencies:** None  

Create fixtures capturing UUID + contains and other simple array motifs to validate G_valid behavior as defined in spec §6.3.2.

### 9402.9402004. Write tests for G_valid arrays and golden snapshots

**Status:** pending  
**Dependencies:** None  

Add tests asserting that structural Repair is unused for G_valid arrays and that non-G_valid arrays preserve previous behavior, per spec §6.4–§6.5.
