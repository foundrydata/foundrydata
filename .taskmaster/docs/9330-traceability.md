# Traceability — Task 9330 (Harden coverage invariants: unreachable, AP:false, determinism)

This document maps the parent task 9330 bullets from Implementation Details, Deliverables, Definition of Done and Test Strategy to its subtasks 9330.9330001–9330.9330003.

## Parent bullets

### Implementation Details

- [KR1] Centralize the mapping between strong UNSAT/guardrail diagnostics and unreachable targets so that `applyUnreachableStatusToTargets` is driven by a single, well-documented list of diagnostic codes.
- [KR2] Guarantee that `excludeUnreachable` only affects denominators in metrics (overall, byDimension, byOperation) and never changes `CoverageTarget.id` or `CoverageTarget.status`; unreachable targets must remain discoverable via `status:'unreachable'` in `targets` / `uncoveredTargets`.
- [KR3] Under `additionalProperties:false`, ensure that `PROPERTY_PRESENT` targets for undeclared property names are only materialized when backed by `CoverageIndex.has` / `CoverageIndex.enumerate` and never inferred solely from `propertyNames` / `patternProperties`.
- [KR4] Extend determinism checks for `coverage=off` vs `coverage=measure` and `coverage=measure` vs `coverage=guided` on a broader schema corpus (including AP:false-heavy schemas, OpenAPI specs and compound conditionals), ensuring instance streams and metrics obey the spec.

### Deliverables

- [DEL1] Hardened unreachable mapping logic and tests in `packages/core/src/coverage/coverage-analyzer-unreachable.ts`.
- [DEL2] Additional AP:false / CoverageIndex-specific tests in analyzer and generator acceptance suites.
- [DEL3] Extended pipeline / e2e coverage tests comparing `coverage=off` vs `coverage=measure` and `coverage=measure` vs `coverage=guided` for representative schemas.

### Definition of Done

- [DOD1] All unreachable / UNSAT behavior flows through a single mapping table with tests capturing expected paths from diagnostics to `status:'unreachable'`.
- [DOD2] AP:false invariants for `PROPERTY_PRESENT` and CoverageIndex usage are enforced by targeted unit and e2e tests.
- [DOD3] Determinism tests for off / measure / guided cover at least: simple object schema, AP:false schema, oneOf/anyOf with hints, and a small OpenAPI spec; tests pass consistently and remain stable.

### Test Strategy

- [TS1] Unit tests in `coverage-analyzer-unreachable` asserting which diagnostic codes produce unreachable targets and verifying prefix-based matching on `canonPath`.
- [TS2] Analyzer tests covering AP:false + CoverageIndex combinations, including `propertyNames` / `patternProperties` with and without `PNAMES_REWRITE_APPLIED`.
- [TS3] Pipeline-orchestrator and e2e coverage tests running `executePipeline` under `coverage=off`, `coverage=measure` and `coverage=guided` on multiple schemas and asserting byte-identical items for off vs measure, strictly improved coverage for guided, stable IDs / unreachable statuses, and correct `excludeUnreachable` denominator behavior.

## Mapping 9330 subtasks → parent bullets

- **9330.9330001 – Centralize UNSAT codes and unreachable mapping**  
  Covers: [KR1], [KR2], [DEL1], [DOD1], [TS1].

- **9330.9330002 – Reinforce AP:false & CoverageIndex invariants**  
  Covers: [KR3], [DEL2], [DOD2], [TS2].

- **9330.9330003 – Extend determinism tests for off/measure/guided**  
  Covers: [KR2], [KR4], [DEL3], [DOD3], [TS3].
