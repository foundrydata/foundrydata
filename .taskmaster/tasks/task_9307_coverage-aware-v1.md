# Task ID: 9307

**Title:** Implement streaming coverage instrumentation with per-instance commit

**Status:** pending

**Dependencies:** 9302, 9303

**Priority:** medium

**Description:** Upgrade coverage instrumentation to a streaming model that updates coverage as instances flow through Generate, Repair and Validate without a second JSON parse.

**Details:**

[Context]
Move from any temporary post-pass coverage computation to the streaming model required for steady-state V1, per §4.3 (Generator instrumentation) and §8 (Technical constraints & invariants). Coverage must be updated as instances pass through Generate and Repair, with hits committed only after Validate, and total overhead must remain O(#instances + #targets).

[Key requirements]
- Replace any full post-pass re-parse of generated output with in-memory, streaming coverage instrumentation across Generate, Repair and Validate.
- Maintain per-instance coverage state that accumulates events, then commit hits to global target bitmaps once Validate accepts the instance.
- Ensure coverage=guided mode uses the same streaming infrastructure as coverage=measure, with additional hints but no extra parse.
- Integrate coverage instrumentation metrics into existing per-phase metrics (e.g. generateMs, repairMs, validateMs) to make overhead measurable.
- Preserve determinism: coverage bitmaps and reports must be identical across runs for fixed inputs and options.

[Deliverables]
- Streaming coverage accumulator implementation in packages/core/src/coverage/coverage-state.ts.
- Orchestrator wiring to attach per-instance coverage state and commit hits after validation.
- Updated metrics plumbing to capture coverage-related overhead.

[Commands]
- npm run build
- npm run test -- --runInBand
- npm run bench

[Definition of Done]
- No phase performs a second JSON parse of the emitted output solely for coverage; coverage computation is fully streaming.
- Coverage metrics and reports remain unchanged relative to the M0 implementation on existing tests and fixtures.
- Overhead is measured via bench scripts and remains within acceptable SLOs given the additional instrumentation.
- Determinism tests confirm that repeated runs produce identical coverage bitmaps and reports.

**Test Strategy:**

Unit tests for streaming coverage state that simulate per-instance event flows and validate final hit sets; integration tests that run the full pipeline and compare coverage reports before and after the streaming refactor; benchmark runs to assess performance overhead and confirm O(#instances + #targets) behavior; determinism tests that run multiple times and compare coverage reports bit-for-bit.

## Subtasks

### 9307.9307001. Implement per-instance coverage state and bitmap representation

**Status:** pending  
**Dependencies:** None  

Create structures to capture per-instance events and global bitmaps for CoverageTargets in a streaming fashion.

### 9307.9307002. Wire streaming coverage into pipeline phases

**Status:** pending  
**Dependencies:** None  

Attach coverage state across Generate, Repair and Validate so hits are committed only after successful validation.

### 9307.9307003. Remove any post-pass coverage computation

**Status:** pending  
**Dependencies:** None  

Eliminate or guard any remaining full post-pass coverage code paths and ensure tests rely only on streaming instrumentation.

### 9307.9307004. Benchmark streaming coverage overhead

**Status:** pending  
**Dependencies:** None  

Use existing bench harnesses to measure the impact of streaming coverage and adjust implementation if needed.
