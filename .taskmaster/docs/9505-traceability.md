# Traceability — Task 9505 (Add coverage-independence and determinism regression tests for Repair)

This document maps the parent task 9505 bullets from Implementation Details, Deliverables and Test Strategy to its subtasks 9505.9505001–9505.9505003.

## Parent bullets

### Implementation Details

- [KR1] Repair’s behaviour is validated to be observationally independent from coverageMode and dimensionsEnabled for a fixed schema/options/seed, with off vs measure runs producing identical Repair outputs and decisions.
- [KR2] DimensionsEnabled variants for coverage (e.g. structure/branches/enum subsets) are shown not to affect Repair decisions, only the CoverageAnalyzer/metrics projections, under the same determinism tuple.
- [KR3] Determinism of Repair is guarded by regression tests that fix the determinism tuple and assert stable outputs across multiple runs, even when coverage settings and planner diagnostics differ.

### Deliverables

- [DEL1] One or more pipeline-level tests that compare coverage=off vs coverage=measure for the same schema and options, asserting equivalence of repaired outputs, repair actions and repair-phase diagnostics.
- [DEL2] Tests that exercise different dimensionsEnabled subsets while keeping Repair outputs and decisions unchanged, focusing on schemas that trigger both Tier-1 and Tier-2 repairs outside G_valid.
- [DEL3] Determinism regression tests that guard against hidden non-determinism in Repair for fixed seeds and options, integrated into the core test suite and documented against the coverage-independence spec.

### Definition of Done

- [DOD1] For at least one representative schema, coverage=off and coverage=measure runs with the same options/seed yield identical `artifacts.repaired`, `artifacts.repairActions` and `artifacts.repairDiagnostics`, with differences confined to coverage artefacts.
- [DOD2] DimensionsEnabled variations do not alter Repair outputs or repair-phase diagnostics for the same schema/options/seed; any differences are limited to coverage/reporting artefacts.
- [DOD3] Regression tests for determinism and coverage-independence are green and stable, and are referenced in documentation or test-traceability notes for Repair philosophy.

### Test Strategy

- [TS1] E2E pipeline tests that run `executePipeline` twice (coverage=off vs coverage=measure) on the same schema/options/seed and deep-compare Repair outputs and diagnostics.
- [TS2] Similar tests that vary dimensionsEnabled profiles while asserting identical Repair artefacts, including a schema that triggers Tier-1 numeric/string repairs and Tier-2 structural repairs outside G_valid.
- [TS3] Re-run determinism-focused tests multiple times in a row or via property-based loops to detect hidden non-determinism in Repair decisions independent of coverage.

## Mapping 9505 subtasks → parent bullets

- **9505.9505001 – Add coverage=off vs coverage=measure repair equivalence test**  
  Covers: [KR1, DEL1, DOD1, TS1] (status: done).

- **9505.9505002 – Add dimensionsEnabled invariance test**  
  Covers: [KR2, DEL2, DOD2, TS2] (status: pending).

- **9505.9505003 – Add deterministic pre-repair fixture path (optional helper)**  
  Covers: [KR3, DEL3, DOD3, TS3] (status: pending).
