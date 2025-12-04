# Traceability — Task 9506 (Add micro-schemas + E2E assertions for tier behavior, G_valid regressions, and UNSAT stability)

This document maps the parent task 9506 bullets from Implementation Details, Deliverables and Test Strategy to its subtasks 9506.9506001–9506.9506003.

## Parent bullets

### Implementation Details

- [KR1] A focused pack of micro-schemas exists to exercise Tier-1 only behavior (numeric clamp, string minLength, uniqueItems) in isolation, without G_valid or structural keywords interfering.
- [KR2] Complementary micro-schemas exist to exercise Tier-2 repairs outside G_valid (required add, contains witness append, AP:false cleanup), and structural keyword cases inside G_valid that must be blocked/flagged instead of silently succeeding.
- [KR3] At least one controlled UNSAT/stagnation fixture exists that can exhaust bailOnUnsatAfter under a fixed determinism tuple, making Score stagnation and UNSAT_BUDGET_EXHAUSTED emission observable without relying on generator randomness.

### Deliverables

- [DEL1] A shared micro-schema fixture module (TS/JSON) that groups repair-philosophy motifs by tier/G_valid/UNSAT behavior with stable seeds and per-schema commentary.
- [DEL2] E2E tests that use these fixtures to assert expected tier policy outcomes and metrics counters (allowed vs disabled) for G_valid and non-G_valid contexts.
- [DEL3] An UNSAT stagnation test that asserts Score(x) signatures do not strictly decrease across cycles when budgets are exhausted and that UNSAT_BUDGET_EXHAUSTED diagnostics and metrics are emitted deterministically.

### Definition of Done

- [DOD1] Micro-schema fixtures are checked in, documented, and reused by downstream tests without duplication, and they cover the motifs listed in KR1–KR3.
- [DOD2] Tier and G_valid E2E tests built on these fixtures are green and stable, and they assert both actions[] and relevant repair diagnostics/metrics for each motif.
- [DOD3] UNSAT/stagnation tests remain stable across repeated runs and CI environments, and their diagnostics/metrics are wired into the shared diagnostics schema and metrics snapshot without violating determinism.

### Test Strategy

- [TS1] Golden-style tests that snapshot repair actions and key diagnostics per micro-schema, with explicit comments tying each fixture to its intended tier/motif.
- [TS2] Contract tests that compare G_valid vs non-G_valid fixtures, asserting structural repairs are blocked/flagged inside G_valid while remaining allowed (within policy) outside G_valid.
- [TS3] UNSAT/stagnation tests that run multiple repair cycles under a fixed determinism tuple, asserting Score stagnation and UNSAT_BUDGET_EXHAUSTED behavior via diagnostics and metrics.

## Mapping 9506 subtasks → parent bullets

- **9506.9506001 – Create repair-philosophy micro-schema fixtures**  
  Covers: [KR1, KR2, KR3, DEL1, DOD1, TS1] (status: done).

- **9506.9506002 – Add E2E tests asserting tier policy outcomes and counters**  
  Covers: [KR1, KR2, DEL2, DOD2, TS2] (status: pending).

- **9506.9506003 – Add UNSAT stagnation/oscillation test using Score signatures**  
  Covers: [KR3, DEL3, DOD3, TS3] (status: pending).
