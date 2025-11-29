# 9301 Traceability

## Implementation Details
- [CTX1] CoverageAnalyzer sits between Compose and generation to turn canonical artifacts (canonSchema, ptrMap, CoverageIndex, planDiag) into the CoverageGraph and CoverageTarget universe described by `cov://§4#coverageanalyzer`.

## Key requirements
- [KR1] Consume only canonical views/Compose outputs, avoid reparsing raw schema, and postpone operation-level/OP_* targets until later stages.
- [KR2] Materialize structural, branch and enum nodes plus their edges so the downstream planner has a deterministic CoverageGraph covering schemas, properties, branches and simple constraints.
- [KR3] Emit CoverageTargets for enabled dimensions with stable IDs, gating materialization on the `dimensionsEnabled` projection and documenting any subsampling.
- [KR4] Large-enum handling must stay deterministic and annotate subsampled sequences so tooling can rely on the recorded meta fields.
- [KR5] Under `additionalProperties:false`, PROPERTY_PRESENT targets for undeclared names depend solely on CoverageIndex.has / CoverageIndex.enumerate; no ad-hoc automaton is allowed.
- [KR6] Unreachable targets are computed from trusted diagnostics (UNSAT hints, CoverageIndex emptiness) and heuristics are conservative.
- [KR7] Outputs share the Spec’s determinism guarantees: fixed canonical view plus options yield the same graph, target IDs and statuses, regardless of RNG.
- [KR8] CoverageAnalyzer runs only when coverageMode is `measure` or `guided`; coverage=off skips the analyzer entirely.

## Deliverables
- [DEL1] Implementation in `packages/core/src/coverage/analyzer.ts` plus ID generation glue defined by task 9300.
- [DEL2] Pipeline orchestrator wiring so Compose output feeds CoverageAnalyzer before the planner/generator once coverageMode permits.
- [DEL3] Unit tests and fixtures exercising schema nodes, AP:false objects and enums to lock down topology/determinism.

## Definition of Done
- [DOD1] Pipeline invocations return deterministic graphs and targets for every enabled dimension when the analyzer is run.
- [DOD2] Analyzer logic relies solely on canonical views and Compose diagnostics; there is no raw-schema reparsing.
- [DOD3] `unreachable` is applied only when Compose produces strong diagnostics, and tests guard against false positives.
- [DOD4] Schema-level IDs remain stable irrespective of OpenAPI context, with operation-level targets deferred to task 9310.
- [DOD5] Integration tests confirm CoverageAnalyzer is skipped whenever coverageMode is `off`.
- [DOD6] New diagnostics/status flags receive unit-test coverage before hitting CI.

## Test Strategy
- [TS1] Unit tests with small fixtures (AP:false objects, enums, dimension toggles) validate deterministic graphs/targets, coverage-index-driven PROPERTY_PRESENT targets, and stable IDs under repeated runs.

## Mapping 9301.y → parent bullets
| Subtask | Bullets | Status |
| 9301.9301001 | [KR1, KR8, DOD2, DEL2] | covered |
| 9301.9301002 | [KR2, KR7, DOD1, DEL1] | covered |
| 9301.9301003 | [KR3, KR5, DOD1, DOD6, TS1, DEL3] | covered |
| 9301.9301004 | [KR6, DOD3, DOD6] | covered |
| 9301.9301005 | [TS1, DOD6] | covered |
