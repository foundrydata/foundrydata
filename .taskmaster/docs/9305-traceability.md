# Traceability — Task 9305 (Implement static CoveragePlanner for guided coverage (M1))

This document maps the parent task 9305 bullets from Implementation Details, Deliverables, Definition of Done and Test Strategy to its subtasks 9305.9305001–9305.9305005.

## Parent bullets

### Implementation Details

- [KR1] Implement the CoveragePlanner stage for `coverage=guided`, consuming CoverageGraph and the full CoverageTarget set and producing a deterministic sequence of TestUnits with per-unit hints and planned instance counts, under an overall maxInstances budget and optional caps.
- [KR2] Keep the planner static and greedy in V1: build all TestUnits up front from the initial CoverageTarget set, without adaptive feedback from coverage results during execution.
- [KR3] Apply a stable prioritization order over targets: operations first when present, then dimensions (branches → enum → structure → boundaries), then weight and canonical path, ensuring deterministic sorting for fixed inputs.
- [KR4] Treat maxInstances as an upper bound on the total instance budget, allowing early stop when all active targets are covered or only unreachable / capped targets remain.
- [KR5] Implement deterministic caps per dimension/schema/operation and surface them via diagnostics.plannerCapsHit and meta.planned:false on unplanned targets.
- [KR6] Derive TestUnit seeds deterministically from a masterSeed and stable rules so that planner output is reproducible across runs for the same inputs and options.

### Deliverables

- [DEL1] CoveragePlanner implementation under `packages/core/src/coverage/coverage-planner.ts`.
- [DEL2] Planner diagnostics and meta fields wired into CoverageTargets and `CoverageReport.diagnostics.plannerCapsHit`.
- [DEL3] Integration in the pipeline orchestrator for `coverage=guided` mode, including mapping CLI `--n` and profiles to maxInstances and caps.

### Definition of Done

- [DOD1] For small schemas and adequate budget, the planner produces TestUnits that exercise all active branch and enum targets, matching acceptance scenarios for oneOf and enums.
- [DOD2] Planner respects maxInstances as a hard upper bound and may terminate earlier once coverage objectives are satisfied.
- [DOD3] Planner caps behavior on large target sets is deterministic and fully surfaced through plannerCapsHit and meta.planned:false on unplanned targets.
- [DOD4] Seeds and TestUnit ordering are stable across runs for the same canonical schema, options and seed.
- [DOD5] Integration tests show that `coverage=guided` improves metrics.byDimension for branches and enums compared to `coverage=measure` under the same maxInstances.

### Test Strategy

- [TS1] Unit tests for planner prioritization and budget handling, using synthetic CoverageTargets to verify TestUnit sequences and meta.planned flags.
- [TS2] Property-based tests for seed derivation and determinism of planner output.
- [TS3] Integration tests that run `coverage=guided` on sample schemas and assert that branch and enum coverage reach 100% when budget permits, matching acceptance criteria.
- [TS4] Tests that compare planned vs unplanned targets when caps are hit, checking plannerCapsHit entries and meta.planned:false behavior.

## Mapping 9305 subtasks → parent bullets

- **9305.9305001 – Design TestUnit structure and planner inputs**  
  Covers: [KR1], [KR2], contributes to [DEL1], [TS1].

- **9305.9305002 – Implement greedy prioritization and budget handling**  
  Covers: [KR2], [KR3], [KR4], [DEL1], [DOD1], [DOD2], [TS1].

- **9305.9305003 – Implement planner caps and diagnostics**  
  Covers: [KR5], [DEL2], [DOD3], [TS4].

- **9305.9305004 – Derive deterministic seeds for TestUnits**  
  Covers: [KR6], [DOD4], [TS2].

- **9305.9305005 – Add integration tests for coverage=guided planning behavior**  
  Covers: [DEL3], [DOD1], [DOD5], [TS3], [TS4].

Status:

- 9305.9305001: covered
