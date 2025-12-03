# Traceability — Task 9406 (Expose G_valid behavior and Generator vs Repair contract in CLI, profiles and docs)

This document maps the parent task 9406 bullets from Implementation Details, Deliverables and Test Strategy to its subtasks 9406.9406001–9406.9406003.

## Parent bullets

### Implementation Details

- [KR1] Add PlanOptions and core API knobs to control G_valid classification/enforcement and the strictness of Repair inside G_valid zones.
- [KR2] Wire G_valid-related options through CLI flags and profiles so that users can enable/disable G_valid behavior while preserving current defaults when G_valid is off.
- [KR3] Document the Generator vs Repair contract, G_valid scope and the interpretation of repair usage metrics in developer-facing docs (Features, COMPREHENSIVE_FEATURE_SUPPORT, etc.).

### Deliverables

- [DEL1] PlanOptions and core API types extended with G_valid configuration fields, mapped into pipeline context in a backward-compatible way.
- [DEL2] CLI/Node CLI profiles updated with flags for G_valid and Repair strictness, with defaults that do not change existing behavior when G_valid is disabled.
- [DEL3] Documentation pages updated to describe G_valid behavior, the Generator vs Repair contract and how to read repair usage metrics.

### Definition of Done

- [DOD1] G_valid-related configuration is available at PlanOptions/core API level and correctly propagated into pipeline execution.
- [DOD2] CLI flags and profiles expose G_valid options with sane defaults and round-trip correctly through the CLI UX.
- [DOD3] Documentation clearly explains how to enable/disable G_valid, how Repair behaves inside G_valid zones and how to interpret the associated metrics.

### Test Strategy

- [TS1] Unit tests for PlanOptions parsing and API wiring, asserting correct defaults and G_valid-related fields.
- [TS2] Integration tests for CLI and Node API with different G_valid configurations, verifying Generator/Repair/metrics behavior is as expected.
- [TS3] Documentation/tests-traceability checks confirming that the new options and contract are consistently documented.

## Mapping 9406 subtasks → parent bullets

- **9406.9406001 – Add G_valid-related options to PlanOptions and core API**  
  Covers: [KR1, DEL1, DOD1, TS1] (status: done).

- **9406.9406002 – Wire G_valid options through CLI flags and profiles**  
  Covers: [KR2, DEL2, DOD2, TS2] (status: done).

- **9406.9406003 – Update feature and usage docs with G_valid guidance**  
  Covers: [KR3, DEL3, DOD3, TS3] (status: pending).
