# Task ID: 9303

**Title:** Implement coverage report format and CoverageEvaluator

**Status:** pending

**Dependencies:** 9300 ⧖, 9301, 9302

**Priority:** high

**Description:** Aggregate coverage results into the versioned JSON coverage-report/v1 format and expose coverage metrics and uncovered targets.

**Details:**

[Context]
Implement CoverageEvaluator and the JSON coverage report format per coverage-aware spec §4.4 (CoverageEvaluator) and §7.1 (JSON coverage report). This includes computing metrics.overall, metrics.byDimension, metrics.byOperation, targetsByStatus and thresholds, and emitting targets and uncoveredTargets arrays according to reportMode semantics.

[Key requirements]
- Implement CoverageEvaluator that consumes CoverageTargets, hit information, coverage options (dimensionsEnabled, excludeUnreachable) and planner diagnostics and produces metrics and report arrays.
- Compute metrics.overall, metrics.byDimension and metrics.byOperation exactly as defined in the spec, including correct handling of status:'unreachable' and dimensionsEnabled filtering; metrics.byOperation MUST be computed as a projection over all reachable targets per operation whose dimension is enabled.
- Ensure targets with status:'deprecated' (including diagnostic-only targets such as SCHEMA_REUSED_COVERED) never contribute to metrics.overall, metrics.byDimension, metrics.byOperation or minCoverage enforcement, while still being visible in targets, uncoveredTargets and diagnostics.
- Represent unreachable targets solely via their status:'unreachable' in targets (and uncoveredTargets when hit:false); there is no dedicated unreachableTargets array in the report, and any unreachable-only view MUST be obtained by filtering on status.
- Implement report header fields (version, reportMode, engine, run, metrics, thresholds, diagnostics) with deterministic values for a given run and options.
- Support both full and summary report modes, with clear semantics: full materializes the complete targets[] set for all enabled dimensions, summary may truncate targets[] and uncoveredTargets[] while still computing metrics over the full target universe built by the Analyzer.
- Expose uncoveredTargets sorted by priority (dimension, weight, type, path) and include unsatisfiedHints and plannerCapsHit diagnostics for guided runs; in reportMode:'full', uncoveredTargets MUST contain all targets with hit:false whose status is either 'active' or 'unreachable'; in reportMode:'summary', uncoveredTargets MAY be truncated while all metrics are still computed over the full target universe built by the Analyzer.

[Deliverables]
- CoverageEvaluator implementation under packages/core/src/coverage/coverage-evaluator.ts.
- CoverageReport type definition under packages/shared/src/types/coverage-report.ts.
- Integration in the pipeline result and Node API to return a CoverageReport Promise alongside the data stream.

[Definition of Done]
- CoverageEvaluator computes metrics that match hand-calculated expectations on small fixtures for all dimensions, including operations when available once task 9310 is implemented.
- coverage-report/v1 JSON structure matches the spec, including reportMode semantics, dimensionsEnabled and excludeUnreachable behavior (denominators only, IDs and statuses unchanged), thresholds wiring for overall coverage only, and unreachable targets discoverable solely via status:'unreachable' in targets/uncoveredTargets.
- Diagnostic-only targets such as SCHEMA_REUSED_COVERED are present in targets[] and diagnostics but are excluded from all coverage metrics and thresholds via status:'deprecated'.
- Coverage reports are deterministic across repeated runs for the same (schema, options, seed, AJV major, registryFingerprint).
- Uncovered targets list and targetsByStatus counters are consistent and validated in tests.
- Node API and CLI can emit a valid coverage-report/v1 JSON file for coverage=measure and coverage=guided runs.

**Test Strategy:**

Unit tests for CoverageEvaluator that feed synthetic CoverageTargets and hit bitmaps and assert metrics and report arrays; tests that exercise excludeUnreachable true/false and confirm denominators change while targetsByStatus stays consistent and unreachable targets are discoverable by filtering status:'unreachable' from targets/uncoveredTargets; tests toggling dimensionsEnabled to ensure IDs for common targets remain stable and metrics are computed only over enabled dimensions; tests that include SCHEMA_REUSED_COVERED targets with status:'deprecated' and verify they never affect metrics.overall, metrics.byDimension or metrics.byOperation; golden JSON fixtures for coverage-report/v1 to catch regressions; integration tests that run the pipeline end-to-end on small schemas and OpenAPI specs (once 9310 is present) and compare the resulting coverage report with expected metrics and unreachable views derived from status; include a pre-9310 scenario where metrics.byOperation is empty while other metrics are still computed correctly, to document intermediate behavior before operation-level coverage is available.

## Subtasks

### 9303.9303001. Define CoverageReport types and thresholds structure

**Status:** pending  
**Dependencies:** None  

Create TypeScript definitions for CoverageReport, PlannerCapHit and UnsatisfiedHintReasonCode matching the spec.

### 9303.9303002. Implement CoverageEvaluator metrics aggregation

**Status:** pending  
**Dependencies:** None  

Compute metrics.overall, metrics.byDimension, metrics.byOperation, targetsByStatus, thresholds and uncoveredTargets from CoverageTargets and hit data, respecting dimensionsEnabled, excludeUnreachable (denominators-only) and diagnostic-only targets; uncoveredTargets must include all targets with hit:false whose status is either 'active' or 'unreachable', and unreachable targets must be represented via status:'unreachable' in targets (and uncoveredTargets when hit:false) rather than a dedicated unreachableTargets array, so unreachable-only views are obtained by filtering on status.

### 9303.9303003. Implement reportMode full vs summary behavior

**Status:** pending  
**Dependencies:** None  

Add logic to include or truncate targets and uncoveredTargets arrays depending on reportMode while keeping metrics exact over the full target universe.

### 9303.9303004. Wire CoverageEvaluator into pipeline result and Node API

**Status:** pending  
**Dependencies:** None  

Attach coverage report computation to the pipeline orchestrator and expose it as a Promise alongside the data stream.

### 9303.9303005. Add snapshot tests for coverage-report/v1 JSON

**Status:** pending  
**Dependencies:** None  

Create snapshot tests that generate coverage reports on sample schemas and assert stable JSON shape and values, including dimensionsEnabled and targetsByStatus.
