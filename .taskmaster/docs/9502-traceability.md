# Traceability — Task 9502 (Add repair-philosophy diagnostics codes and metrics counters)

This document maps the parent task 9502 bullets from Implementation Details, Deliverables and Test Strategy to its subtasks 9502.9502001–9502.9502003.

## Parent bullets

### Implementation Details

- [KR1] Diagnostics for Repair philosophy (tier-disabled, reverted-no-progress) are declared in the shared diagnostics registry with the correct phase and payload schemas.
- [KR2] Metrics counters for Repair tiers and policy events are exposed via the central metrics snapshot, aligned with the canonical spec and determinism requirements.
- [KR3] Reporter/CLI output and snapshot expectations reflect the new diagnostics and metrics without breaking existing consumers.

### Deliverables

- [DEL1] Updated diagnostics registry, types and schemas for the Repair philosophy codes, with tests validating payload shapes and phases.
- [DEL2] Extended metrics collector and snapshot types to include per-tier action counters and policy-disabled/reverted-no-progress counts.
- [DEL3] Updated reporter/CLI snapshots and serializers to tolerate and expose the new metrics/diagnostics fields where appropriate.

### Definition of Done

- [DOD1] Repair-philosophy diagnostics are uniquely identified in the registry, validated by schemas, and have consistent phases; no conflicting or duplicate codes exist.
- [DOD2] Metrics counters for Repair tiers and policy events are stable and deterministic across runs for a fixed determinism tuple and enabled metrics.
- [DOD3] All affected tests and snapshots are green and the CLI/reporter remain backward-compatible for existing fields.

### Test Strategy

- [TS1] Unit tests for diagnostics registry and schema validation, including the Repair-specific codes and payloads.
- [TS2] Unit/integration tests for metrics counters to assert deterministic increments and correct wiring into snapshots.
- [TS3] Snapshot tests for reporter/CLI output including the new diagnostics and metrics fields.

## Mapping 9502 subtasks → parent bullets

- **9502.9502001 – Add new repair diagnostics codes to registry and schema**  
  Covers: [KR1, DEL1, DOD1, TS1] (status: done).

- **9502.9502002 – Add per-tier + policy counters to metrics snapshot**  
  Covers: [KR2, DEL2, DOD2, TS2] (status: pending).

- **9502.9502003 – Update reporter/CLI snapshot expectations for new metrics/diagnostics**  
  Covers: [KR3, DEL3, DOD3, TS3] (status: pending).
