# Traceability — Task 9306 (Wire coverage hints into generator with conflict resolution and unsatisfied hints)

This document maps the parent task 9306 bullets from Implementation Details, Deliverables, Definition of Done and Test Strategy to its subtasks 9306.9306001–9306.9306008.

## Parent bullets

### Implementation Details

- [KR1] Define coverage hint types `preferBranch(schemaPath, branchIndex)`, `ensurePropertyPresence(schemaPath, property, present)` and `coverEnumValue(schemaPath, valueIndex)` and attach them to TestUnits produced by the CoveragePlanner.
- [KR2] Extend the generator to consume hints only in `coverage=guided` mode, preserving AJV validity and falling back to default generator heuristics when hints are absent, inapplicable or unsatisfiable.
- [KR3] Implement deterministic conflict resolution rules for hints on the same schema node, with a fixed global priority order by kind (`coverEnumValue > preferBranch > ensurePropertyPresence`) and stable ordering within each kind (first in `hints[]` wins for a given tuple).
- [KR4] Detect unsatisfied hints when Repair modifies values or constraints make hinted targets unreachable, and record them as `unsatisfiedHints` with `reasonCode` and `reasonDetail`, keeping them diagnostic-only in V1.
- [KR5] Keep hints and unsatisfied hints fully deterministic for fixed inputs, integrating them into coverage reports and diagnostics without introducing new randomness or perturbing existing RNG sequences.

### Deliverables

- [DEL1] Type-level and runtime representation of hints and unsatisfied hints in the core coverage module, including validation helpers.
- [DEL2] Generator extensions to accept and consume hints at relevant decision points (branches, property presence, enum values) in `coverage=guided` mode.
- [DEL3] Repair and reporting integration that records unsatisfied hints and exposes them in coverage diagnostics and reports without affecting coverage metrics or CLI exit codes.

### Definition of Done

- [DOD1] On representative schemas, guided coverage with hints can steer branch and enum choices while preserving AJV validity and determinism, matching acceptance scenarios for oneOf/anyOf and enums.
- [DOD2] Runs with `coverage=off` or `coverage=measure` are unaffected by hints, and coverage metrics remain consistent with the existing coverage model.
- [DOD3] Unsatisfied hints are recorded with clear reasons whenever they cannot be honored, and never change `coverageStatus`, `minCoverage` enforcement or CLI exit codes in V1.
- [DOD4] For a fixed `(canonical schema, OpenAPI spec, coverage options, seed, ajvMajor, registryFingerprint)`, TestUnits, hints, generated instances and coverage reports remain stable across runs.

### Test Strategy

- [TS1] Unit tests for hint typing, validation and priority rules, including stable ordering for hints targeting the same schema node.
- [TS2] Generator-level tests that verify coverage-guided runs obey hint priority while never emitting AJV-invalid instances.
- [TS3] Tests that exercise unsatisfied hints in both generator and Repair, asserting that they are recorded with correct `reasonCode`/`reasonDetail` and remain diagnostic-only.
- [TS4] End-to-end tests that run `coverage=guided` on schemas with oneOf/anyOf and enums, asserting that hints improve coverage on `branches` and `enum` dimensions compared to `coverage=measure` under the same budgets.

## Mapping 9306 subtasks → parent bullets

- **9306.9306001 – Define hint types and priority rules**  
  Covers: [KR1], [KR3], [DEL1], [TS1] (in-progress → covered after implementation and tests).

- **9306.9306002 – Integrate hints into generator decision points**  
  Covers: [KR2], [KR3], [DEL2], [DOD1], [TS2] (covered).

- **9306.9306003 – Record unsatisfied hints from generator and repair**  
  Covers: [KR4], [DEL1], [DOD3], [TS3] (covered for generator-side detection; repair-side hooks and full report wiring remain for later subtasks).

- **9306.9306004 – Add tests for hint precedence and determinism**  
  Covers: [KR3], [KR5], [DOD4], [TS1], [TS2] (covered; planner and generator tests assert global kind priority, first-in-wins semantics and deterministic behavior for fixed seeds and hint sets).

- **9306.9306005 – Add end-to-end tests for guided hints on schemas with oneOf and enums**  
  Covers: [KR1], [KR2], [KR3], [DOD1], [DOD4], [TS4] (covered via generator-level tests on oneOf+enum schemas.

- **9306.9306006 – Wire planner hints into pipeline orchestrator and add guided hints e2e tests**  
  Covers: [KR1], [KR2], [KR3], [DEL2], [DOD1], [DOD4], [TS2], [TS4] (covered; this subtask wires planner-produced TestUnit.hints through the pipeline orchestrator into the generator in coverage=guided mode and adds executePipeline-based tests that demonstrate guided runs matching or improving branches/enum coverage vs coverage=measure under the same budget while remaining deterministic for fixed (schema, options, seed)).

- **9306.9306007 – Attach ensurePropertyPresence hints for PROPERTY_PRESENT targets in CoveragePlanner**  
  Covers: [KR1], [DOD1], [DOD4], [TS2] (covered; this subtask projects structural PROPERTY_PRESENT targets from the CoverageAnalyzer into ensurePropertyPresence(present:true) hints on the owning object schema nodes in the CoveragePlanner, without changing CoverageTarget IDs, ordering or AP:false / CoverageIndex semantics, and adds planner-level tests to validate the mapping and dimensionsEnabled gating).

- **9306.9306008 – Collect unsatisfied hints in pipeline and expose coverageReport.unsatisfiedHints**  
  Covers: [KR4], [DOD3], [DOD4], [TS3] (covered; this subtask extends the pipeline orchestrator to aggregate unsatisfiedHints reported by the generator in coverage=guided mode via a CoverageHookOptions callback and to expose them in CoverageReport.unsatisfiedHints without affecting coverage metrics, minCoverage enforcement or CLI exit codes, with executePipeline tests verifying the presence and shape of unsatisfiedHints entries for scenarios where hints cannot be honored).

- **9306.9306009 – Implement hint trace and Repair-side unsatisfied hints**  
  Covers: [KR4], [KR5], [DEL3], [DOD3], [DOD4], [TS3] (covered; this subtask introduces an internal per-instance hint trace shared between Generate and Repair for guided runs, and extends Repair to emit UnsatisfiedHint entries with reasonCode REPAIR_MODIFIED_VALUE on a best-effort basis when applied hints (ensurePropertyPresence, coverEnumValue) are no longer satisfied in the final AJV-valid instance, while keeping unsatisfiedHints strictly diagnostic-only and preserving determinism for fixed inputs).

- **9306.9306010 – Fix ensurePropertyPresence hint trace for reused definitions**  
  Covers: [KR4], [KR5], [DEL3], [DOD3], [DOD4], [TS3] (in-progress; this subtask ensures the instance path recorded for hints that originate from reused `$defs`/`definitions` matches the actual container when Repair re-checks the final instance, removing the false `REPAIR_MODIFIED_VALUE` diagnostics described by the latest review).

Status:

- 9306.9306001: covered
- 9306.9306002: covered
- 9306.9306003: covered
- 9306.9306004: covered
- 9306.9306006: covered
- 9306.9306007: covered
- 9306.9306008: covered
- 9306.9306009: covered
- 9306.9306010: in-progress
