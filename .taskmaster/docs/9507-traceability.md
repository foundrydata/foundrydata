# Traceability — Task 9507 (Repair-guided coverage regression for profiles/simple.json after per-pass Score commit rule)

This document maps the parent task 9507 bullets from Implementation Details, Deliverables and Test Strategy to its subtasks 9507.1–9507.5.

## Parent bullets

### Implementation Details

- [KR1] The Score-based per-pass commit rule is validated to preserve Repair coverage-independence for the real-world `profiles/simple.json` schema, with coverage=off and coverage=measure producing identical Repair artefacts and metrics for a fixed determinism tuple.
- [KR2] Revert semantics and diagnostics for Score-based stagnation on `profiles/simple.json` are exercised so that REPAIR_REVERTED_NO_PROGRESS and associated counters behave deterministically without leaking coverage state.
- [KR3] Determinism and baseline metrics for Repair on `profiles/simple.json` (including distribution of repairPassesPerRow and repairActionsPerRow) are characterised and documented against the canonical Repair philosophy spec.

### Deliverables

- [DEL1] Regression tests for `profiles/simple.json` that compare coverage=off vs coverage=measure and assert equivalence of `artifacts.repaired`, `artifacts.repairActions`, `artifacts.repairDiagnostics` and key Repair metrics.
- [DEL2] Regression tests and diagnostics assertions that cover Score-based revert behaviour for `profiles/simple.json`, including REPAIR_REVERTED_NO_PROGRESS payloads and counters.
- [DEL3] Baseline metrics snapshot and documentation for Repair on `profiles/simple.json`, integrated into the core test/bench harness and aligned with the canonical spec anchors.

### Definition of Done

- [DOD1] For `profiles/simple.json`, coverage=off and coverage=measure runs with the same options/seed yield identical Repair artefacts and metrics, with any differences confined to coverage/reporting artefacts.
- [DOD2] Score-based revert behaviour, diagnostics and counters for `profiles/simple.json` are guarded by stable tests, and determinism is validated for a fixed determinism tuple across multiple runs.
- [DOD3] Baseline Repair metrics for `profiles/simple.json` are recorded, kept within agreed SLOs and referenced in documentation or test-traceability notes without regressing existing gates.

### Test Strategy

- [TS1] E2E pipeline tests that run `executePipeline` on `profiles/simple.json` twice (coverage=off vs coverage=measure) for the same options/seed and deep-compare Repair artefacts and metrics.
- [TS2] Tests that drive Score-based revert scenarios on `profiles/simple.json`, asserting REPAIR_REVERTED_NO_PROGRESS diagnostics, Score-before/after invariants and associated counters.
- [TS3] Extended tests and benches that measure determinism and distribution of Repair metrics for `profiles/simple.json` (including higher-count runs) and keep them under bench gates.

## Mapping 9507 subtasks → parent bullets

- **9507.1 – Add coverage-independence regression test for simple.json profile**  
  Covers: [KR1, DEL1, DOD1, TS1] (status: done).

- **9507.2 – Add Score revert regression test for simple.json with REPAIR_REVERTED_NO_PROGRESS diagnostic**  
  Covers: [KR2, DEL2, DOD2, TS2] (status: done).

- **9507.3 – Add determinism regression test for simple.json repair with identical tuples**  
  Covers: [KR3, DEL3, DOD3, TS3] (status: done).

- **9507.4 – Capture baseline repair metrics distribution for simple.json (n=1000)**  
  Covers: [KR3, DEL3, DOD3, TS3] (status: done).

- **9507.5 – Document simple.json repair baseline and verify spec alignment**  
  Covers: [KR3, DEL3, DOD3, TS3] (status: done).

- **9507.3 – Add determinism regression test for simple.json repair with identical tuples**  
  Covers: [KR2, KR3, DEL2, DEL3, DOD2, DOD3, TS2, TS3] (status: pending).

- **9507.4 – Capture baseline repair metrics distribution for simple.json (n=1000)**  
  Covers: [KR3, DEL3, DOD3, TS3] (status: pending).

- **9507.5 – Document simple.json repair baseline and verify spec alignment**  
  Covers: [KR3, DEL3, DOD3, TS3] (status: pending).
