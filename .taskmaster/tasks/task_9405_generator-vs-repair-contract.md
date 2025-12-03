# Task ID: 9405

**Title:** Add repair usage metrics and G_valid motif observability

**Status:** pending

**Dependencies:** 9401, 9402, 9403, 9404

**Priority:** high

**Description:** Instrument the pipeline with motif-level metrics so that repair usage inside and outside G_valid zones is observable and testable.

**Details:**

[Context]
The brief requires that the Generator/Repair boundary be observable. G_valid zones should exhibit little or no structural Repair, and any drift must be visible in metrics and tests.
Aligns with spec §6.6 (Metrics and testing for G_valid) and with existing metrics sections (§15/§20) for integration into the current metrics model.

[Key requirements]
- Define a metrics model for repair usage per motif (motif id, items, itemsWithRepair, actions, G_valid flag) and integrate it into existing metrics.
- Tag Repair actions with canonPath + motif + G_valid and aggregate them at run end.
- Surface aggregated metrics through existing metrics snapshots and optionally diagnostics/logs.
- Add e2e tests for micro-schemas explicitly labeled as G_valid that assert structural Repair counts are zero (or within a small numeric-only allowance).
- Update tests-traceability docs with a new "Generator-valid zone" motif family and its invariants, referencing spec §6.6.

**Test Strategy:**

- Unit tests for metrics aggregation ensuring per-motif counters are incremented and grouped correctly by G_valid flag.
- Integration tests running the full pipeline on pure G_valid and mixed schemas, verifying that structural Repair counts for G_valid motifs are zero in nominal cases.
- Golden tests on metrics snapshots to detect regressions in Repair usage over time.
- Documentation/tests-traceability checks confirming that the new motif family and invariants are documented.

## Subtasks

### 9405.9405001. Define repair usage metrics model by motif and G_valid flag

**Status:** pending  
**Dependencies:** None  

Design types for motif-level repair usage metrics and integrate them into the existing metrics model, aligned with spec §6.6 and existing metrics sections (§15/§20).

### 9405.9405002. Instrument Repair to emit motif-tagged usage events

**Status:** pending  
**Dependencies:** None  

Emit lightweight events or counters from Repair whenever an action is applied, tagged with canonPath, motif and G_valid flag, and feed them into the new metrics model per spec §6.6.

### 9405.9405003. Aggregate and expose repair usage metrics in pipeline orchestrator

**Status:** pending  
**Dependencies:** None  

Wire repair usage metrics into the pipeline orchestrator so they are aggregated per run and exposed with existing timing/validation metrics, consistent with spec §15/§20.

### 9405.9405004. Add G_valid no-repair e2e tests and traceability entries

**Status:** pending  
**Dependencies:** None  

Create end-to-end tests and update tests-traceability documentation for G_valid micro-schemas asserting that structural Repair is unused, per spec §6.6–§6.7.
