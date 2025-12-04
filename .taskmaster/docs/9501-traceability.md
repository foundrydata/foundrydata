# Traceability — Task 9501 (Implement stable AJV error signature and Score(x) utilities)

This document maps the parent task 9501 bullets from Implementation Details, Deliverables and Test Strategy to its subtasks 9501.9501001–9501.9501003.

## Parent bullets

### Implementation Details

- [KR1] A shared, deterministic implementation of `stableParamsKey(params)` and `sig(e)` exists and matches the canonical spec definition for Score(x) (canonPath resolution, params canonicalization, distinct-signature counting).
- [KR2] The repair/termination logic reuses the shared utilities for sig(e)/Score(x) instead of ad‑hoc encodings, eliminating duplicated or inconsistent progress metrics.
- [KR3] Determinism constraints for Score(x) and related diagnostics/metrics are preserved across runs and configurations consistent with the determinism tuple in §14/§15.

### Deliverables

- [DEL1] New core utility module(s) implementing `stableParamsKey(params)` and any supporting canonicalization helpers, with unit tests pinning their behavior on representative AJV `params` payloads.
- [DEL2] A `canonPath(e)` + `sig(e)` helper wired to the canonical pointer mapping, with tests ensuring stable `canonPath` fallback and signature construction.
- [DEL3] A `Score(x)` helper computing the cardinality of distinct signatures from AJV `allErrors:true` lists, with golden tests to guard regressions.

### Definition of Done

- [DOD1] Score(x) and sig(e) implementation matches the canonical spec (§10 Repair philosophy, progress metric) for a fixed determinism tuple, with no alternative encodings in the codebase.
- [DOD2] All Repair termination and stagnation checks use the shared Score utilities and no longer rely on transient error lists or unstable params encodings.
- [DOD3] Build/typecheck/lint/test/bench remain green after integrating the utilities, and determinism properties hold under the reference harness.

### Test Strategy

- [TS1] Unit tests for `stableParamsKey(params)` and related helpers, verifying key sorting, array handling, number normalization (including `-0`), and structural equality vs inequality cases.
- [TS2] Unit tests for `canonPath(e)` and `sig(e)` construction, including fallback to `schemaPath` and stability across permutations of AJV error ordering.
- [TS3] Golden tests computing Score(x) from AJV error fixtures, ensuring duplicates collapse correctly and Score remains stable under permutations and across runs.

## Mapping 9501 subtasks → parent bullets

- **9501.9501001 – Add stable JSON canonicalization helper for AJV params**  
  Covers: [KR1, DEL1, DOD1, TS1] (status: done).

- **9501.9501002 – Implement canonPath(e) resolution + sig(e) builder**  
  Covers: [KR1, DEL2, DOD1, TS2] (status: pending).

- **9501.9501003 – Implement Score(x) from AJV allErrors list**  
  Covers: [KR2, KR3, DEL3, DOD2, DOD3, TS3] (status: pending).
