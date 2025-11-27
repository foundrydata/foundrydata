# Task ID: 9305

**Title:** Implement static CoveragePlanner for guided coverage (M1)

**Status:** pending

**Dependencies:** 9301, 9302, 9303, 9307

**Priority:** high

**Description:** Create a greedy, deterministic CoveragePlanner that proposes TestUnits with hints and respects maxInstances and planner caps.

**Details:**

[Context]
Implement the CoveragePlanner stage for coverage=guided, as specified in §4.2 (CoveragePlanner) and §6.2 (Budget & profiles). The planner consumes CoverageGraph and targets and produces a deterministic sequence of TestUnits with derived seeds, planned instance counts and per-unit hints, under an overall maxInstances budget and optional caps.

[Key requirements]
- Implement a static, greedy planner that builds all TestUnits up front from the initial CoverageTarget set, without adaptive feedback during the run.
- Prioritize targets by scope (operations first when present), dimension (branches → enum → structure → boundaries) and then by weight and canonical path, with stable sorting rules.
- Respect maxInstances as an upper bound, allowing early stop when all active targets are covered or when only unreachable or capped targets remain.
- Implement deterministic caps per dimension/schema/operation and surface them via diagnostics.plannerCapsHit and meta.planned:false on unplanned targets.
- Generate TestUnit seeds deterministically from a masterSeed and stable derivation rules so that runs are reproducible across executions.

[Deliverables]
- CoveragePlanner implementation under packages/core/src/coverage/coverage-planner.ts.
- Planner diagnostics and meta fields wiring into CoverageTargets and CoverageReport.diagnostics.plannerCapsHit.
- Integration in the pipeline orchestrator for coverage=guided mode, including mapping CLI --n and profiles to maxInstances and caps.

[Commands]
- npm run build
- npm run test -- --runInBand
- npm run test packages/core/src/coverage/__tests__/coverage-planner.spec.ts

[Definition of Done]
- For small schemas, planner produces TestUnits that exercise all active branch and enum targets within the budget, matching acceptance scenarios for oneOf and enums.
- Planner respects maxInstances as a hard upper bound and may stop earlier once coverage objectives are satisfied.
- Planner caps behavior (when large target sets are present) is deterministic and fully surfaced in plannerCapsHit and meta.planned:false on unplanned targets.
- Seeds and TestUnit ordering are stable across runs for the same inputs and options.
- Integration tests show that coverage=guided improves coverage.byDimension for branches and enums compared to coverage=measure under the same maxInstances.

**Test Strategy:**

Unit tests for planner prioritization and caps, using synthetic CoverageTargets to verify TestUnit sequences and meta.planned flags; property-based tests for seed derivation and determinism; integration tests that run coverage=guided on sample schemas and assert that branch and enum coverage reach 100% when budget permits, matching acceptance criteria; tests that compare planned vs unplanned targets when caps are hit.

## Subtasks

### 9305.9305001. Design TestUnit structure and planner inputs

**Status:** pending  
**Dependencies:** None  

Define TestUnit type and planner configuration (maxInstances, dimensions, priorities, caps) and integrate with CoverageGraph and CoverageTargets.

### 9305.9305002. Implement greedy prioritization and budget handling

**Status:** pending  
**Dependencies:** None  

Implement the greedy selection algorithm over targets, enforcing prioritization rules and maxInstances constraints.

### 9305.9305003. Implement planner caps and diagnostics

**Status:** pending  
**Dependencies:** None  

Add deterministic caps per dimension/schema/operation and report them via diagnostics.plannerCapsHit and meta.planned:false.

### 9305.9305004. Derive deterministic seeds for TestUnits

**Status:** pending  
**Dependencies:** None  

Implement masterSeed derivation into per-TestUnit seeds and add tests for reproducibility across runs.

### 9305.9305005. Add integration tests for coverage=guided planning behavior

**Status:** pending  
**Dependencies:** None  

Run the full pipeline on acceptance schemas to confirm planner helps hit all oneOf branches and enum values with sufficient budget.
