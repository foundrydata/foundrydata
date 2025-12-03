# Task ID: 9404

**Title:** Constrain Repair behavior inside G_valid zones and surface violations

**Status:** pending

**Dependencies:** 9401, 9402, 9403

**Priority:** high

**Description:** Update the Repair engine so that structural fixes in G_valid zones are treated as contract violations and surfaced via diagnostics/metrics instead of normal behavior.

**Details:**

[Context]
Today Repair may synthesize required fields or empty objects/arrays when AJV reports gaps. Inside G_valid zones, this should be exceptional and visible, not routine.
Aligns with spec §6.4–§6.5 (Repair obligations and limits in G_valid) and §10 (Repair Engine mapping and budgets).

[Key requirements]
- Consume G_valid motif information in Repair so actions can branch on per-path G_valid state.
- In G_valid zones, prevent or strongly discourage structural actions (adding required props, synthesizing sub-objects/arrays); when needed, emit explicit diagnostics and count them.
- Keep non-structural actions (numeric nudges, uniqueItems de-duplication) allowed as in spec §6.5.
- Preserve current behavior and diagnostics for non-G_valid locations, including budgets and UNSAT_BUDGET_EXHAUSTED.
- Provide a feature flag to relax G_valid constraints for compatibility/debugging.

**Test Strategy:**

- Unit tests simulating AJV errors on G_valid paths that require structural fixes, asserting that Repair either rejects them with diagnostics or marks them as contract violations.
- Tests verifying that numeric/format tweaks and uniqueItems de-duplication still run in G_valid zones.
- Integration tests on G_valid schemas confirming that structural Repair is not used in nominal cases and that non-G_valid schemas preserve baseline behavior.
- Tests for the feature flag toggling G_valid constraints without breaking determinism.

## Subtasks

### 9404.9404001. Wire G_valid motif information into Repair engine

**Status:** pending  
**Dependencies:** None  

Plumb G_valid motif metadata into repair-engine.ts so Repair actions can branch on per-path G_valid state, according to spec §6.4–§6.5.

### 9404.9404002. Restrict structural Repair actions in G_valid zones

**Status:** pending  
**Dependencies:** None  

Update the (keyword → action) registry to avoid structural additions/removals on G_valid paths and introduce diagnostics when such actions would be required, following spec §6.5 and §10.

### 9404.9404003. Add tests and diagnostics for G_valid Repair violations

**Status:** pending  
**Dependencies:** None  

Define diagnostics for G_valid Repair violations, update diag schemas and add tests asserting they are emitted under simulated contract breaches, aligned with spec §6.5 and §15/§20 for test gates.
