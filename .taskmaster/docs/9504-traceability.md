# Traceability — Task 9504 (Implement Repair tier classification and default tier policy)

This document maps the parent task 9504 bullets from Implementation Details, Deliverables and Test Strategy to its subtasks 9504.9504001–9504.9504003.

## Parent bullets

### Implementation Details

- [KR1] A shared Tier model and tier-by-motif classification helper exist for Repair actions, covering numeric bounds, string shape, uniqueness, array sizing and structural motifs in line with the canonical baseline, and remaining independent from coverage/planning state.
- [KR2] The Repair policy gate combines tier classification with G_valid and structuralKeywords metadata to decide whether a candidate Repair action is allowed, surfaces policy-disabled decisions via diagnostics/metrics and preserves the Generator/Repair contract for G_valid locations.
- [KR3] The Repair engine, metrics collector and reporters apply the default tier policy deterministically for a fixed determinism tuple and keep REPAIR_TIER_DISABLED events observable without altering AJV-oracle semantics or the existing repair process order.

### Deliverables

- [DEL1] Tier enum/types and a deterministic mapping function (keyword/motif → tier) exported from a dedicated module and used consistently as the single source of truth for tier classification in the Repair engine.
- [DEL2] A policy gate helper `isActionAllowed(canonPath, keyword, tier, gValidInfo, structuralKeywords)` integrated into the Repair engine, emitting REPAIR_TIER_DISABLED diagnostics/metrics when a Repair action is blocked by policy while leaving the instance unchanged for that attempt.
- [DEL3] Updated metrics/reporting wiring so that tier and policy-disabled counters are incremented exclusively via the shared helpers, with reporter/CLI outputs reflecting the new counters without breaking existing consumers.

### Definition of Done

- [DOD1] Every Repair action that mutates an instance is classifiable into exactly one Tier (0–3), with Tier 1, Tier 2 and Tier 3 assignments matching the canonical baseline and a stable default fallback (Tier 2) for unlisted motifs.
- [DOD2] For a fixed determinism tuple, tier classification and the default policy gate produce stable, coverage-independent decisions across runs and do not relax G_valid obligations or structuralKeywords guards.
- [DOD3] All affected unit, integration and reporter tests are green after enabling tier classification and policy gating, and diagnostics/metrics remain schema-compatible with the shared diagnostics envelope and metrics model.

### Test Strategy

- [TS1] Unit tests that exercise the Tier model and keyword/motif → tier mapping table, including the default fallback rule and a sample of unknown keywords.
- [TS2] Engine-level tests for the policy gate that cover the matrix {G_valid/non-G_valid} × {structural/non-structural keywords} × {tier}, asserting REPAIR_TIER_DISABLED diagnostics and metrics increments where applicable.
- [TS3] End-to-end and reporter/CLI tests that verify tier counters, policy-disabled events and REPAIR_TIER_DISABLED diagnostics are surfaced deterministically without affecting AJV validation results or coverage behaviour.

## Mapping 9504 subtasks → parent bullets

- **9504.9504001 – Define Tier model and tier mapping by keyword/motif**  
  Covers: [KR1, DEL1, DOD1, TS1] (status: done).

- **9504.9504002 – Implement policy gate using G_valid + structuralKeywords metadata**  
  Covers: [KR2, DEL2, DOD2, TS2] (status: done).

- **9504.9504003 – Add tests for tier mapping and policy gating**  
  Covers: [KR3, DEL3, DOD3, TS3] (status: pending).
