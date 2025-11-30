# Traceability — Task 9333 (Harden CLI coverage profiles and coverage-report UX)

This document maps the parent task 9333 bullets from Implementation Details, Deliverables, Definition of Done and Test Strategy to its subtasks 9333.9333001–9333.9333003.

## Parent bullets

### Implementation Details

- [KR1] Profile semantics for quick/balanced/thorough (dimensionsEnabled, planner caps, recommendedMaxInstances) are precisely defined and enforced.
- [KR2] CLI coverage summary output is a faithful projection of coverage-report/v1 metrics and diagnostics.
- [KR3] A recommended CI profile combines coverage=measure, a specific coverage profile and minCoverage, with examples based on coverage-report/v1.

### Deliverables

- [DEL1] Strengthened resolveCliCoverageOptions behavior with tests encoding profile semantics and error handling.
- [DEL2] CLI end-to-end tests exercising generate/openapi with coverage profiles and checking coverage summary vs coverage-report/v1.
- [DEL3] Updated docs describing coverage profiles, flags and coverage-report fields as a coherent UX.

### Definition of Done

- [DOD1] Changing profile or flags has well-specified, tested effects on coverage options and reported metrics.
- [DOD2] CLI coverage summary is demonstrably derived from coverage-report/v1 for all covered scenarios.
- [DOD3] Recommended CI profile is described, tested and documented.

### Test Strategy

- [TS1] Unit tests for coverage profile options and error handling around resolveCliCoverageOptions.
- [TS2] CLI black-box tests for generate/openapi with coverage profiles, comparing coverage summary and coverage-report/v1.
- [TS3] Docs/examples kept in sync with the tested CLI coverage scenarios.

## Mapping 9333 subtasks → parent bullets

- **9333.9333001 – Pin CLI coverage profile semantics with tests**  
  Covers: [KR1, DEL1, DOD1, TS1] (status: covered).
 
- **9333.9333002 – Align CLI coverage summary with coverage-report/v1**  
  Covers: [KR2, DEL2, DOD2, TS2] (status: covered).
 
- **9333.9333003 – Document recommended CI profile and report reading**  
  Covers: [KR3, DEL3, DOD3, TS3] (status: pending).
