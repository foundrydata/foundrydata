# Traceability — Task 9503 (Enforce Score-based commit rule in Repair engine)

This document maps the parent task 9503 bullets from Implementation Details, Deliverables and Test Strategy to its subtasks 9503.9503001–9503.9503003.

## Parent bullets

### Implementation Details

- [KR1] The Repair engine uses the shared Score(x) utilities on AJV allErrors:true output, wired through the canonical pointer mapping, to obtain deterministic progress metrics per attempt.
- [KR2] The commit loop in Repair enforces the Score-based commit rule (only commit when Score(x') < Score(x)), with safe revert semantics and no divergence from the Generator/Repair contract.
- [KR3] Revert-related diagnostics and metrics (including REPAIR_REVERTED_NO_PROGRESS and associated counters) accurately reflect Score-based decisions without leaking coverage state.

### Deliverables

- [DEL1] Wiring of Score(x) computation into the AJV-driven Repair engine, reusing the sig(e)/Score(x) helpers and canonical pointer mapping without changing existing Repair behaviour.
- [DEL2] Updated Repair loop that performs deterministic commit/revert based on Score(x) deltas, while preserving action logging semantics and idempotence.
- [DEL3] Diagnostics and metrics emitted on revert (including Score details where required by the spec) are validated against the shared diagnostics envelope and metrics model.

### Definition of Done

- [DOD1] Score(x) is the single source of truth for Repair progress in the engine, and all stagnation/commit decisions depend on the shared utilities instead of ad‑hoc heuristics.
- [DOD2] The commit/revert implementation is deterministic for a fixed determinism tuple, preserves G_valid invariants and does not alter the Repair process order.
- [DOD3] All affected tests and benchmarks (unit, integration, reporter/CLI) are green after enabling Score-based commit logic, and diagnostics/metrics remain schema-compatible.

### Test Strategy

- [TS1] Unit tests that exercise Score(x) wiring inside the Repair engine by driving repairItemsAjvDriven with small schemas/instances and asserting that Score helpers are invoked deterministically.
- [TS2] Integration tests that verify commit/revert behaviour for schemas where candidate repairs do or do not strictly reduce Score(x), including G_valid and non-G_valid zones.
- [TS3] Snapshot and diagnostics tests that validate REPAIR_REVERTED_NO_PROGRESS payloads, UNSAT_BUDGET_EXHAUSTED behaviour and metrics counters for revert events.

## Mapping 9503 subtasks → parent bullets

- **9503.9503001 – Wire Score(x) computation into repair action attempts**  
  Covers: [KR1, DEL1, DOD1, TS1] (status: done).

- **9503.9503002 – Implement deterministic revert mechanism for failed commit attempts**  
  Covers: [KR2, DEL2, DOD2, TS2] (status: done).

- **9503.9503003 – Emit revert diagnostics and increment counters**  
  Covers: [KR3, DEL3, DOD3, TS3] (status: done).
