# Task ID: 9302

**Title:** Add passive coverage instrumentation for measurement mode (M0)

**Status:** pending

**Dependencies:** 9300 ⧖, 9301

**Priority:** high

**Description:** Instrument generator and repair stages to emit coverage events for structure, branches and enums in coverage=measure mode without changing generated instances.

**Details:**

[Context]
Implement M0 coverage measurement for the existing pipeline, per coverage-aware spec §2.1 (Phase M0) and §4.3 (Generator instrumentation). coverage=measure must compute coverage from final instances (after Repair + Validate) for SCHEMA_NODE, PROPERTY_PRESENT, ONEOF_BRANCH, ANYOF_BRANCH, CONDITIONAL_PATH and ENUM_VALUE_HIT targets, while leaving generator behavior identical to coverage=off for a given (schema, seed, options).

[Key requirements]
- Extend Generate and Repair to emit coverage events for schema nodes, optional property presence, oneOf/anyOf/conditional branches and enum values, using canonical pointers from the CoverageGraph.
- Under AP:false, property presence coverage for undeclared property names MUST be derived solely from CoverageIndex.has / CoverageIndex.enumerate; instrumentation must not infer additional property names from patternProperties or propertyNames beyond what CoverageIndex exposes.
- Ensure events are only committed as hits once instances have passed Validate; invalid instances must not mark targets as hit.
- For coverage=measure, guarantee that the sequence of emitted instances is byte-for-byte identical to coverage=off for the same inputs; instrumentation must be purely observational and must not affect generation decisions.
- Implement a first coverage accumulator that can support temporary post-pass computation for M0, while anticipating streaming updates required in M1.
- Add toggles so coverage instrumentation is fully disabled when coverage=off, keeping overhead negligible and ensuring that in that mode neither CoverageAnalyzer nor coverage accumulators are invoked.

[Deliverables]
- Coverage event models and accumulator implementation under packages/core/src/coverage/coverage-events.ts.
- Instrumentation hooks in generator and repair code paths to record branches, property presence and enum usage.
- Configuration plumbing from CLI and Node API to select coverage=off or coverage=measure and to pass dimensionsEnabled down to instrumentation.

[Definition of Done]
- With coverage=measure and coverage=off, the generated data streams are identical for the same schemas and seeds, confirmed by golden tests.
- Coverage accumulators correctly mark hits only after Validate, and targets remain unhit when instances are invalid or filtered out.
- Property presence and branch hits (including ANYOF_BRANCH and CONDITIONAL_PATH) are derived from canonical view and CoverageGraph, not raw schema re-parsing, and AP:false property coverage matches CoverageIndex semantics for undeclared names.
- Overhead of coverage=measure is measured and documented via existing metrics, and instrumentation cost is included in per-phase timings.
- New instrumentation paths are guarded by feature flags so coverage=off behavior and performance remain within existing SLOs.

**Test Strategy:**

Golden snapshot tests comparing coverage=off vs coverage=measure output for the same schema and seed; unit tests for coverage event aggregation and per-target hit semantics (including ANYOF_BRANCH and CONDITIONAL_PATH); integration tests that run the full pipeline and assert that coverage metrics match expected hits on small schemas with oneOf, anyOf, conditional branches, optional properties and enums; tests for AP:false fixtures where CoverageIndex is empty and PROPERTY_PRESENT for undeclared names never appears, and where non-empty CoverageIndex ensures PROPERTY_PRESENT only for names it exposes; benchmark runs to confirm overhead stays within acceptable bounds.

## Subtasks

### 9302.9302001. Define coverage event model and accumulator

**Status:** pending  
**Dependencies:** None  

Create event types for schema, property, branch and enum hits and an accumulator that maps them to CoverageTargets.

### 9302.9302002. Instrument generator for branches and enums

**Status:** pending  
**Dependencies:** None  

Add hooks in the generator to emit coverage events when oneOf/anyOf/conditional branches are chosen and enum values are produced, keyed by canonical paths and branch identifiers.

### 9302.9302003. Instrument repair and property presence

**Status:** pending  
**Dependencies:** None  

Emit coverage events when properties are added or removed in Repair and when optional properties are present in final instances, including AP:false objects where property names come from CoverageIndex.

### 9302.9302004. Integrate coverage accumulators into pipeline orchestrator

**Status:** pending  
**Dependencies:** None  

Wire coverage accumulators into the pipeline so coverage=measure collects events during Generate and Repair and finalizes after Validate, with all coverage code completely disabled when coverage=off.

### 9302.9302005. Add regression tests for coverage=off vs coverage=measure equivalence

**Status:** pending  
**Dependencies:** None  

Create tests that run generate with and without coverage measurement and assert identical outputs while coverage metrics differ, including schemas with conditional branches (if/then/else or dependentSchemas) to verify CONDITIONAL_PATH events are emitted without changing generated instances.
