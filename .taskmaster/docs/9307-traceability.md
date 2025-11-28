# Traceability — Task 9307 (Implement streaming coverage instrumentation with per-instance commit)

This document maps the parent task 9307 bullets from Implementation Details, Deliverables, Definition of Done and Test Strategy to its subtasks 9307.9307001–9307.9307004.

## Parent bullets

### Implementation Details

- [KR1] Move coverage computation towards a streaming model where coverage events are emitted as instances flow through Generate and Repair, and hits are committed only once Validate has accepted the instance.
- [KR2] Replace any full post-pass coverage computation that reparses the generated JSON stream with an in-memory model based on per-instance state and global bitmaps over CoverageTargets.
- [KR3] Maintain a clear separation between per-instance coverage state and global hit sets so that committing or discarding an instance never corrupts coverage accumulated from previous instances.
- [KR4] Ensure that coverage=measure and coverage=guided share the same streaming infrastructure, with guided mode adding hints without requiring an extra parse.
- [KR5] Keep coverage overhead bounded by O(#instances + #targets) by using compact representations for target indices and hit bitmaps rather than per-event dynamic structures.
- [KR6] Integrate coverage instrumentation hooks with existing pipeline phases (Generate, Repair, Validate) without changing their external contracts or introducing additional passes over the data.

### Deliverables

- [DEL1] Data structures and helper functions under `packages/core/src/coverage` to represent per-instance coverage state and global bitmaps backed by CoverageTargets.
- [DEL2] A reusable indexing primitive that maps CoverageEvents to CoverageTarget IDs, suitable for both per-instance state and global coverage aggregation.
- [DEL3] A streaming-friendly coverage accumulator type exported from the coverage module that can be wired into generator and repair instrumentation.
- [DEL4] Internal documentation in code and tests that clarifies how per-instance state, global bitmaps and commit semantics interact.

### Definition of Done

- [DOD1] Per-instance coverage state can accumulate CoverageEvents for a single candidate instance without mutating global hit sets until an explicit commit occurs.
- [DOD2] Global coverage bitmaps reflect only instances that have passed Validate; rejected instances do not leave residual hits in global state.
- [DOD3] The representation supports both coverage=measure and coverage=guided without changing the shape of CoverageTargets or their identifiers.
- [DOD4] Coverage state and bitmap operations are deterministic for a fixed (canonical schema, coverage options, seed, AJV major, registryFingerprint) tuple.
- [DOD5] The cost of recording events and committing per-instance state grows linearly with the number of events and targets involved, with no quadratic behavior introduced by the new structures.

### Test Strategy

- [TS1] Unit tests for per-instance coverage state that simulate event flows for a single instance and assert the resulting per-instance hit sets.
- [TS2] Unit tests for global coverage bitmaps that commit multiple per-instance states, including accepted and rejected instances, and assert that only accepted ones affect global hits.
- [TS3] Tests that exercise both direct target ID marking and event-based mapping to ensure the indexing primitive behaves consistently for structure, branches and enum dimensions.
- [TS4] Tests that validate deterministic behavior by running the same sequence of events and commits multiple times and comparing global hit sets.
- [TS5] Micro-bench-style tests or assertions that the streaming accumulator does not allocate unbounded per-instance structures as the number of targets grows.

## Mapping 9307 subtasks → parent bullets

- **9307.9307001 – Implement per-instance coverage state and bitmap representation**  
  Covers: [KR1], [KR2], [KR3], [DEL1], [DEL2], [DEL3], [DOD1], [DOD2], [TS1], [TS2], [TS3], [TS4]. Status: in-progress (data structures and unit tests implemented in coverage module).

- **9307.9307002 – Wire streaming coverage into pipeline phases**  
  Covers: [KR1], [KR4], [KR6], [DEL3], [DEL4], [DOD2], [DOD3]. Status: pending.

- **9307.9307003 – Remove any post-pass coverage computation**  
  Covers: [KR2], [DOD2], [DOD5]. Status: pending.

- **9307.9307004 – Benchmark streaming coverage overhead**  
  Covers: [KR5], [DOD4], [DOD5], [TS5]. Status: pending.

