# Task ID: 9301

**Title:** Implement CoverageAnalyzer from canonical Compose artifacts

**Status:** pending

**Dependencies:** 9300 ⧖

**Priority:** high

**Description:** Build CoverageAnalyzer to derive the CoverageGraph and full CoverageTarget set from Normalize/Compose artifacts.

**Details:**

[Context]
Implement CoverageAnalyzer as a new stage between Compose and generation, per coverage-aware spec §4.1 (CoverageAnalyzer) and §3.1 (CoverageGraph). The analyzer consumes canonical schemas, ptrMap, CoverageIndex, planDiag and optional OpenAPI context and produces a deterministic CoverageGraph plus the exhaustive CoverageTarget set for the enabled dimensions (structure, branches, enum) in M0/M1.

[Key requirements]
- Consume only canonical view and Compose artifacts (canonSchema, ptrMap, CoverageIndex, planDiag) and optional OpenAPI context; never reparse the raw schema, and do not construct OperationNodes or OP_* targets in this task.
- Materialize CoverageGraph nodes and edges for schemas, properties, branches (oneOf/anyOf/conditionals), enums (including potentially large enums) and simple structural constraints, as preparation for the boundaries dimension introduced in task 9309, without yet materializing *_HIT targets for boundaries, with structural, logical and reference edges.
- Generate CoverageTargets for all enabled dimensions (structure, branches, enum in M0/M1) with stable IDs using the model defined in task 9300. In standard modes, do not materialize targets for dimensions that are not in dimensionsEnabled; any future debug/introspection mode must be explicitly opt-in.
- For large enums, Analyzer MAY deterministically subsample enum values into CoverageTargets, recording this in target meta (for example meta.enumSubsampled:true and/or skipped indices) so behavior is reproducible and visible to tooling.
- Under AP:false, PROPERTY_PRESENT targets for undeclared property names must be backed exclusively by CoverageIndex.has / CoverageIndex.enumerate; CoverageAnalyzer must not introduce a separate automaton for AP:false property names, must only create PROPERTY_PRESENT targets for names exposed by CoverageIndex and must not diverge from CoverageIndex semantics.
- Derive status:'unreachable' targets conservatively from existing diagnostics (e.g. UNSAT_* codes, CoverageIndex emptiness) and branch pruning heuristics, without introducing a separate proof engine; when in doubt, prefer leaving targets active and uncovered.
- Ensure analyzer output is deterministic for fixed inputs and options, with no RNG or time-dependent behavior, and treat dimensionsEnabled as a projection over a stable target universe (toggling dimensionsEnabled does not change IDs of targets present in both configurations).
- Ensure CoverageAnalyzer is only invoked when coverageMode is 'measure' or 'guided'; pipeline runs with coverage=off must skip CoverageAnalyzer entirely to keep overhead close to the current engine.

[Deliverables]
- CoverageAnalyzer implementation under packages/core/src/coverage/coverage-analyzer.ts.
- Integration glue in the pipeline orchestrator to run CoverageAnalyzer after Compose and before planner/generator when coverageMode != 'off'.
- Unit tests and fixtures for schemas with oneOf/anyOf, AP:false objects and enums to validate CoverageGraph topology and targets.

[Definition of Done]
- CoverageAnalyzer can be invoked from the pipeline with canonical Compose outputs and returns a deterministic CoverageGraph and CoverageTarget[] for the enabled dimensions.
- Analyzer never reparses the raw schema or re-implements JSON Schema semantics; all logic is driven by canonical views and existing diagnostics.
- Unreachable targets are marked only when supported by strong signals (UNSAT diagnostics or CoverageIndex emptiness), and tests cover false-positive avoidance.
- When an OpenAPI document is present, schema-level targets and IDs remain stable; operation-level targets and OperationNodes are added later by task 9310, and enabling/disabling OpenAPI context does not change schema-level CoverageTarget.id values.
- Pipeline integration tests verify that CoverageAnalyzer is not called when coverageMode is 'off'.
- All new diagnostics and status markings are covered by unit tests and pass CI.

**Test Strategy:**

Unit tests using small JSON Schema fixtures (including AP:false objects) to snapshot CoverageGraph topology and targets; property-based tests that show adding or removing dimensionsEnabled does not change existing target IDs; targeted tests around AP:false to ensure PROPERTY_PRESENT for undeclared names aligns exactly with CoverageIndex.enumerate; integration tests in the pipeline to assert CoverageAnalyzer is invoked only for coverage=measure/guided and output is deterministic across repeated runs.

## Subtasks

### 9301.9301001. Wire CoverageAnalyzer inputs from Compose

**Status:** pending  
**Dependencies:** None  

Connect canonSchema, ptrMap, CoverageIndex and planDiag into a CoverageAnalyzer entry point, gated so it is only called when coverageMode is 'measure' or 'guided'.

### 9301.9301002. Implement graph construction for schema, property and branch nodes

**Status:** pending  
**Dependencies:** None  

Build CoverageGraph nodes and edges for schemas, properties and oneOf/anyOf/conditional branches using canonical pointers.

### 9301.9301003. Generate CoverageTargets for structure, branches and enum dimensions

**Status:** pending  
**Dependencies:** None  

Materialize SCHEMA_NODE, PROPERTY_PRESENT, ONEOF_BRANCH, ANYOF_BRANCH, CONDITIONAL_PATH and ENUM_VALUE_HIT targets for enabled dimensions, with IDs independent of dimensionsEnabled.

### 9301.9301004. Derive unreachable targets from existing diagnostics

**Status:** pending  
**Dependencies:** None  

Integrate UNSAT_* and AP:false diagnostics and CoverageIndex signals to mark a conservative subset of targets as status:'unreachable'.

### 9301.9301005. Add unit tests for CoverageAnalyzer determinism and topology

**Status:** pending  
**Dependencies:** None  

Create fixtures and tests verifying target sets, IDs and statuses stay stable across runs and for different dimensionsEnabled and coverageMode configurations, including schemas with if/then/else or dependentSchemas so CONDITIONAL_PATH targets are materialized and tracked, and large enums where subsampled enum targets and their meta remain deterministic.
