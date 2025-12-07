# Traceability — Task 9603 (Implement Resolver R1 run-level diagnostics)

This document maps the parent task 9603 bullets from Implementation Details, Deliverables, DoD and Test Strategy to its subtasks 9603.9603001–9603.9603003.

## Parent bullets

### Implementation Details

- [KR1] Run-level resolver diagnostics (strategies, cache hits/misses, offline availability, external ref handling) are registered with the canonical envelope, canonPath fixed to '#' and Compose-phase binding.
- [KR2] Resolver determinism is preserved: registryFingerprint is carried into run metadata and used for comparability/gates; observability stays passive across online/offline/cache profiles.
- [KR3] Run-level reporting integrates external $ref outcomes (stubbed/unresolved) and strategy summaries without altering resolution semantics or branch decisions.

### Deliverables

- [DEL1] Shared schema/types plus validator coverage for resolver `diag.run` entries and resolver diagnostic codes.
- [DEL2] Compose pipeline emits resolver diagnostics (cache hit/miss/offline/strategies/external) deterministically and includes registryFingerprint in run metadata.
- [DEL3] Integration/regression tests across online/offline/cache verify `diag.run` stability and registryFingerprint gating.

### Definition of Done

- [DOD1] `diag.run` entries are validated against schema with phase tagging; canonPath remains '#'; diagnostics tables are updated accordingly.
- [DOD2] Resolver observability remains passive (no control-flow changes) and deterministic for fixed registry fingerprints across strategies/modes.
- [DOD3] Full build → typecheck → lint → test → bench chain stays green with resolver observability enabled.

### Test Strategy

- [TS1] Unit tests for resolver diagnostics schema/validator covering valid and invalid payloads.
- [TS2] Integration tests for resolver `diag.run` in online/offline/cache paths; determinism and canonPath constraints.
- [TS3] Comparability/gate tests leveraging registryFingerprint and resolver metadata.

## Mapping 9603 subtasks → parent bullets

- **9603.9603001 – Register resolver diagnostics codes and schema**  
  Covers: [KR1, DEL1, DOD1, TS1] (status: done — shared resolver diag types added, schema/phase registration tightened, diag.run validation + tests passing).

- **9603.9603002 – Emit resolver diagnostics in Compose pipeline**  
  Covers: [KR1, KR2, KR3, DEL2, DOD1, DOD2, TS2] (status: done — resolver run-level notes (strategies/offline/stubbed/unresolved) now flow into compose.diag.run with canonPath '#', registryFingerprint plumbed into strategies details and resolver strategies memo key, resolver run diagnostics validated via envelope tests and reporter snapshots updated).
  - Update 2025-12-07: run-level resolver diagnostics now carry `phase: compose` to satisfy envelope compliance while keeping observability passive and deterministic.

- **9603.9603003 – Add resolver observability tests (online/offline/cache)**  
  Covers: [KR2, KR3, DEL3, DOD2, DOD3, TS2, TS3] (status: done — integration tests cover offline local-only + stubbed paths and cache miss→hit determinism with stable registryFingerprint and canonPath '#', ensuring diag.run stability and passive observability).
