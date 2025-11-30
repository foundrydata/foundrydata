# Task ID: 9306

**Title:** Wire coverage hints into generator with conflict resolution and unsatisfied hints

**Status:** pending

**Dependencies:** 9302, 9305, 9307

**Priority:** high

**Description:** Implement preferBranch, ensurePropertyPresence and coverEnumValue hints in the generator and record unsatisfied hints and reasons.

**Details:**

[Context]
Implement coverage hints and their interaction with the generator and Repair, as described in §5 (Hints & interaction with Repair). coverage=guided uses hints attached to TestUnits to steer branch choices, property presence and enum values while preserving AJV validity and determinism, and records unsatisfied hints when constraints prevent their satisfaction.

[Key requirements]
- Implement hint types preferBranch(schemaPath, branchIndex), ensurePropertyPresence(schemaPath, property, present) and coverEnumValue(schemaPath, valueIndex) and attach them to TestUnits from the planner.
- Extend the generator to consume hints in coverage=guided mode only, with AJV validity taking precedence and default heuristics used when hints are absent, inapplicable or unsatisfiable.
- Implement deterministic conflict resolution with a global priority order (coverEnumValue > preferBranch > ensurePropertyPresence) and stable ordering within each kind (first in hints[] wins).
- Detect unsatisfied hints when Repair modifies values or when constraints make the hinted target unreachable, and record them as unsatisfiedHints with reasonCode and reasonDetail in the coverage report.
- Ensure hints have no effect in coverage=off and coverage=measure modes and do not alter external driver behavior.

[Deliverables]
- Hint definitions and helper utilities in packages/core/src/coverage/hints.ts.
- Generator integration for hint consumption in packages/core/src/generator/foundry-generator.ts.
- UnsatisfiedHints collection and wiring into CoverageEvaluator and CoverageReport.unsatisfiedHints.

[Commands]
- npm run build
- npm run test -- --runInBand
- npm run test packages/core/src/generator/__tests__/coverage-hints.spec.ts

[Definition of Done]
- Generator respects hints in coverage=guided mode while still emitting only AJV-valid instances; invalid instances caused by hints are rejected and hints are marked unsatisfied.
- Conflict resolution across multiple hints for the same node is deterministic and covered by unit tests.
- Unsatisfied hints are reported with appropriate reasonCode values such as UNREACHABLE_BRANCH, REPAIR_MODIFIED_VALUE or PLANNER_CAP, and are visible in coverage reports without affecting coverageStatus in V1.
- Runs with coverage=off or coverage=measure show no behavioral difference compared to pre-hints behavior.
- Acceptance scenarios for oneOf branches and enum coverage are supported by guided runs that use hints to reach full coverage under sufficient budget.

**Test Strategy:**

Focused unit tests that drive the generator with individual hints and conflicting hints and assert chosen branches, properties and enum values; tests that exercise Repair interactions to produce unsatisfied hints; integration tests in coverage=guided mode verifying that hints improve coverage and that unsatisfiedHints are recorded when constraints make hints impossible to satisfy.

## Subtasks

### 9306.9306001. Define hint types and priority rules

**Status:** pending  
**Dependencies:** None  

Implement Hint interfaces and establish global priority and conflict resolution rules for different hint kinds.

### 9306.9306002. Integrate hints into generator decision points

**Status:** pending  
**Dependencies:** None  

Consume hints in the generator when selecting branches, deciding property presence and picking enum values in coverage=guided mode, without changing AP:false name semantics or CoverageIndex behavior (property-name coverage still comes solely from CoverageIndex).

### 9306.9306003. Record unsatisfied hints from generator and repair

**Status:** pending  
**Dependencies:** None  

Detect when hints cannot be satisfied or are undone by Repair and record UnsatisfiedHint entries with reason codes.

### 9306.9306004. Add tests for hint precedence and determinism

**Status:** pending  
**Dependencies:** None  

Write tests confirming hint precedence order and stable behavior across runs for the same hints.

### 9306.9306005. Add end-to-end tests for guided hints on schemas with oneOf and enums

**Status:** pending  
**Dependencies:** None  

Create e2e tests that show full branch and enum coverage under coverage=guided with sufficient budget and visible unsatisfied hints when impossible.
