# Traceability — Task 9321 (Align feature and limits docs with coverage-aware behavior)

This document maps the parent task 9321 bullets from Implementation Details, Deliverables, Definition of Done and Test Strategy to its subtasks 9321.9321001–9321.9321003.

## Parent bullets

### Implementation Details

- [KR1] Extend `docs/COMPREHENSIVE_FEATURE_SUPPORT.md` with coverage-aware notes indicating which JSON Schema features have coverage-aware behavior (AP:false must-cover, `contains`, conditionals, numeric boundaries, OpenAPI operations) and how they contribute to coverage metrics by dimension.
- [KR2] Add coverage rows or annotations to `docs/Features.md` so that the feature matrix reflects coverage support by dimension and phase (structure/branches/enum in M0, guided coverage in M1, boundaries and per-operation coverage in M2) using the existing ✓ / ~ / ⚠️ legend.
- [KR3] Expand `docs/Known-Limits.md` with coverage-specific limits: caps on target counts, nuances under AP:false for coverage, constraints on the boundaries dimension, and the behavior of `dimensionsEnabled` / `excludeUnreachable` with respect to coverage denominators and target IDs/statuses.
- [KR4] Document that diagnostic-only coverage targets such as `SCHEMA_REUSED_COVERED` are emitted with `status:'deprecated'` and never contribute to coverage metrics or `minCoverage` thresholds, even when present in `targets` / `uncoveredTargets`.

### Deliverables

- [DEL1] Updated `docs/COMPREHENSIVE_FEATURE_SUPPORT.md` that calls out coverage-aware behavior for the most relevant JSON Schema features in a concise subsection.
- [DEL2] Updated `docs/Features.md` with at least one row (or column) indicating coverage support and maturity per dimension and phase.
- [DEL3] Updated `docs/Known-Limits.md` including coverage-specific caps, AP:false coverage nuances, and a brief explanation of how diagnostics-only targets and unreachable targets affect coverage denominators.

### Definition of Done

- [DOD1] Feature and limits docs mention coverage-aware behavior where it materially affects how users interpret feature support and limits; no contradictions with the coverage-aware spec.
- [DOD2] The coverage support rows in `Features.md` are accurate with respect to the current implementation status of coverage tasks (M0/M1/M2) and are easy to maintain as implementation evolves.
- [DOD3] Known limits include coverage-related caps and AP:false nuances in a way that is discoverable and aligned with both the canonical spec and the coverage-aware spec.

### Test Strategy

- [TS1] Manual doc review against the coverage-aware V1 spec for coverage dimensions, diagnostic-only targets and denominator behavior.
- [TS2] Quick scan of implementation status for coverage tasks (930x–932x) to ensure that `Features.md` rows stay in sync with reality.

## Mapping 9321 subtasks → parent bullets

- **9321.9321001 – Extend COMPREHENSIVE_FEATURE_SUPPORT.md with coverage-aware notes**  
  Covers: [KR1], [DEL1], [DOD1], [TS1]. Status: covered (COMPREHENSIVE_FEATURE_SUPPORT.md now includes a concise coverage-aware behavior subsection that maps core JSON Schema features to coverage dimensions and invariants).

- **9321.9321002 – Add coverage rows to Features.md matrix**  
  Covers: [KR2], [DEL2], [DOD2], [TS2]. Status: covered (Features.md now includes coverage rows that summarise measurement/guided/boundaries/operations support per dimension and phase using the ✓ / ~ / ⚠️ legend).

- **9321.9321003 – Expand Known-Limits.md with coverage-aware limits**  
  Covers: [KR3], [KR4], [DEL3], [DOD3], [TS1]. Status: pending.
