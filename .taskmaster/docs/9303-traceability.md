# Traceability — Task 9303 (Implement coverage report format and CoverageEvaluator)

This document maps the parent task 9303 bullets from Implementation Details, Deliverables, Definition of Done and Test Strategy to its subtasks 9303.9303001–9303.9303005.

## Parent bullets

### Implementation Details

- [KR1] Implement CoverageEvaluator that consumes CoverageTargets, hit information, coverage options (dimensionsEnabled, excludeUnreachable) and planner diagnostics and produces metrics and report arrays.
- [KR2] Compute metrics.overall, metrics.byDimension and metrics.byOperation exactly as defined in the spec, including correct handling of status:'unreachable' and dimensionsEnabled filtering; metrics.byOperation MUST be computed as a projection over all reachable targets per operation whose dimension is enabled.
- [KR3] Ensure targets with status:'deprecated' (including diagnostic-only targets such as SCHEMA_REUSED_COVERED) never contribute to metrics.overall, metrics.byDimension, metrics.byOperation or minCoverage enforcement, while still being visible in targets, uncoveredTargets and diagnostics.
- [KR4] Represent unreachable targets solely via their status:'unreachable' in targets (and uncoveredTargets when hit:false); there is no dedicated unreachableTargets array in the report, and any unreachable-only view MUST be obtained by filtering on status.
- [KR5] Implement report header fields (version, reportMode, engine, run, metrics, thresholds, diagnostics) with deterministic values for a given run and options.
- [KR6] Support both full and summary report modes, with clear semantics: full materializes the complete targets[] set for all enabled dimensions, summary may truncate targets[] and uncoveredTargets[] while still computing metrics over the full target universe built by the Analyzer.
- [KR7] Expose uncoveredTargets sorted by priority (dimension, weight, type, path) and include unsatisfiedHints and plannerCapsHit diagnostics for guided runs; in reportMode:'full', uncoveredTargets MUST contain all targets with hit:false whose status is either 'active' or 'unreachable'; in reportMode:'summary', uncoveredTargets MAY be truncated while all metrics are still computed over the full target universe built by the Analyzer.

### Deliverables

- [DEL1] CoverageEvaluator implementation under packages/core/src/coverage/coverage-evaluator.ts.
- [DEL2] CoverageReport type definition under packages/shared/src/types/coverage-report.ts.
- [DEL3] Integration in the pipeline result and Node API to return a CoverageReport Promise alongside the data stream.

### Definition of Done

- [DOD1] CoverageEvaluator computes metrics that match hand-calculated expectations on small fixtures for all dimensions, including operations when available once task 9310 is implemented.
- [DOD2] coverage-report/v1 JSON structure matches the spec, including reportMode semantics, dimensionsEnabled and excludeUnreachable behavior (denominators only, IDs and statuses unchanged), thresholds wiring for overall coverage only, and unreachable targets discoverable solely via status:'unreachable' in targets/uncoveredTargets.
- [DOD3] Diagnostic-only targets such as SCHEMA_REUSED_COVERED are present in targets[] and diagnostics but are excluded from all coverage metrics and thresholds via status:'deprecated'.
- [DOD4] Coverage reports are deterministic across repeated runs for the same (schema, options, seed, AJV major, registryFingerprint).
- [DOD5] Uncovered targets list and targetsByStatus counters are consistent and validated in tests.
- [DOD6] Node API and CLI can emit a valid coverage-report/v1 JSON file for coverage=measure and coverage=guided runs.

### Test Strategy

- [TS1] Unit tests for CoverageEvaluator that feed synthetic CoverageTargets and hit bitmaps and assert metrics and report arrays.
- [TS2] Tests that exercise excludeUnreachable true/false and confirm denominators change while targetsByStatus stays consistent and unreachable targets are discoverable by filtering status:'unreachable' from targets/uncoveredTargets.
- [TS3] Tests toggling dimensionsEnabled to ensure IDs for common targets remain stable and metrics are computed only over enabled dimensions.
- [TS4] Tests that include SCHEMA_REUSED_COVERED targets with status:'deprecated' and verify they never affect metrics.overall, metrics.byDimension or metrics.byOperation.
- [TS5] Golden JSON fixtures for coverage-report/v1 to catch regressions.
- [TS6] Integration tests that run the pipeline end-to-end on small schemas and OpenAPI specs (once 9310 is present) and compare the resulting coverage report with expected metrics and unreachable views derived from status.
- [TS7] Pre-9310 scenario where metrics.byOperation is empty while other metrics are still computed correctly, to document intermediate behavior before operation-level coverage is available.

## Mapping 9303 subtasks → parent bullets

- **9303.9303001 – Define CoverageReport types and thresholds structure**  
  Covers: [DEL2], contributes to [DOD2].

- **9303.9303002 – Implement CoverageEvaluator metrics aggregation**  
  Covers: [KR1], [KR2], [KR3], [KR4], [DEL1], [DOD1], [DOD3], [TS1], [TS2], [TS3], [TS4].

- **9303.9303003 – Implement reportMode full vs summary behavior**  
  Covers: [KR5], [KR6], [KR7], contributes to [DOD2], [TS2], [TS5].

- **9303.9303004 – Wire CoverageEvaluator into pipeline result and Node API**  
  Covers: [DEL3], [DOD6], [TS6], [TS7].

- **9303.9303005 – Add snapshot tests for coverage-report/v1 JSON**  
  Covers: [DOD2], [DOD4], [DOD5], [TS5], [TS7]. Status: covered (snapshot tests, determinism and pre-9310 byOperation checks in place and validated).
