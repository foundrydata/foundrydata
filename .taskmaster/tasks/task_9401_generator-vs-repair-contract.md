# Task ID: 9401

**Title:** Implement motif classification and G_valid zoning in core pipeline

**Status:** pending

**Dependencies:** 9400

**Priority:** high

**Description:** Introduce a motif classification layer that marks schema locations as G_valid or non-G_valid based on the effective schema shape.

**Details:**

[Context]
To enforce the contract only where safe, the engine must classify schema locations into G_valid vs non-G_valid motifs using the Compose effective view.
Aligns with spec §6.3–§6.5 (Generator / Repair contract and G_valid v1) and §8 (Compose / effective view) as sources of truth for classification inputs.

[Key requirements]
- Define an internal motif enum/tag (e.g. "simple-object-required", "array-items-contains-simple", "ap-false-must-cover", "complex-contains", etc.) plus a boolean G_valid flag.
- Implement a classifier over canonical/Compose artifacts that marks each canonPath with motif + G_valid, without re-parsing the original schema.
- Respect v1 exclusions (AP:false + CoverageIndex, unevaluated*, complex contains bags, deep conditionals) per spec §6.3.
- Expose motif info to generator, repair and metrics via a cheap lookup in the execution context.
- Add a planOptions/feature flag to disable G_valid classification/enforcement for compatibility.

**Test Strategy:**

- Unit tests that feed canonical schemas + Compose outputs and assert motif + G_valid classification per canonPath.
- Edge-case tests for AP:false + propertyNames/patternProperties, unevaluatedProperties/unevaluatedItems and multi-contains bags.
- Stability tests showing classification is deterministic for fixed inputs and insensitive to allOf branch ordering.
- Smoke tests proving that when the feature flag is off, pipeline behavior matches the current baseline.

## Subtasks

### 9401.9401001. Design G_valid motif types and internal API

**Status:** pending  
**Dependencies:** None  

Define motif and G_valid state types plus helpers (e.g. isGValidSimpleObject, isGValidArrayContains) to be used by generator, repair and metrics, consistent with spec §6.3.

### 9401.9401002. Implement classifier over Compose artifacts

**Status:** pending  
**Dependencies:** None  

Implement the classifier using canonical schema, CoverageIndex and Compose diagnostics to mark canonPaths as G_valid or non-G_valid without re-parsing the original schema, aligned with spec §8 and §6.3.

### 9401.9401003. Wire classifier into generator and repair planning

**Status:** pending  
**Dependencies:** None  

Expose G_valid motif lookup to generator and repair (e.g. via plan context or per-path metadata) so they can adjust behavior inside G_valid zones, per spec §6.4–§6.5.

### 9401.9401004. Add tests for motif classification

**Status:** pending  
**Dependencies:** None  

Create tests that exercise classification for simple objects, arrays with items+contains, AP:false + CoverageIndex cases and unevaluatedProperties/unevaluatedItems, asserting expected G_valid flags according to spec §6.3.
