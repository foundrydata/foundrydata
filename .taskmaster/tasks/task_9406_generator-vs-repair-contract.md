# Task ID: 9406

**Title:** Expose G_valid behavior and Generator vs Repair contract in CLI, profiles and docs

**Status:** pending

**Dependencies:** 9400, 9401, 9402, 9403, 9404, 9405

**Priority:** medium

**Description:** Surface the Generator vs Repair contract and G_valid behavior through PlanOptions, CLI profiles and developer documentation.

**Details:**

[Context]
Once implemented, G_valid and the tightened Generator vs Repair contract must be discoverable and controllable through configuration and docs.
Aligns with spec §6.7 (Interaction with other sections / public behavior) and the general configuration sections that describe PlanOptions and CLI flags.

[Key requirements]
- Add PlanOptions knobs (and Node API mapping) for enabling/disabling G_valid classification/enforcement and controlling strictness of Repair inside G_valid zones.
- Wire these options through CLI flags and profiles, with defaults that preserve current behavior when G_valid is off.
- Update COMPREHENSIVE_FEATURE_SUPPORT/Features/docs to explain the contract, G_valid scope, and how to interpret repair usage metrics.

**Test Strategy:**

- Unit tests for PlanOptions parsing and CLI flags, asserting correct mapping and backward-compatible defaults.
- Integration tests running CLI/Node API with different G_valid configurations and checking that Generator/Repair/metrics behavior matches expectations.
- Documentation checks confirming that new options and the contract are mentioned consistently in feature docs and examples.

## Subtasks

### 9406.9406001. Add G_valid-related options to PlanOptions and core API

**Status:** pending  
**Dependencies:** None  

Extend PlanOptions and core API types with fields controlling G_valid classification/enforcement and map them into pipeline context, consistent with spec §6.7.

### 9406.9406002. Wire G_valid options through CLI flags and profiles

**Status:** pending  
**Dependencies:** None  

Map new G_valid options into CLI flags and profiles, defining which profiles enable G_valid by default and how to turn it off for compatibility.

### 9406.9406003. Update feature and usage docs with G_valid guidance

**Status:** pending  
**Dependencies:** None  

Document G_valid behavior, options and typical usage scenarios in COMPREHENSIVE_FEATURE_SUPPORT, Features and examples docs, referencing spec §6 and the Generator vs Repair contract subsection.
