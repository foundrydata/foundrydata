# Task ID: 9311

**Title:** Add coverage diff tool for multi-run comparison (M2)

**Status:** pending

**Dependencies:** 9303

**Priority:** medium

**Description:** Provide a coverage diff command that compares two coverage-report/v1 files and highlights regressions, added and removed targets.

**Details:**

[Context]
Implement a coverage diff tool as described in §7.4 (Multi-run diff). The tool compares two coverage-report/v1 JSON files produced by compatible engine majors and report versions and surfaces changes in metrics and target statuses, suitable for CI regression checks.

[Key requirements]
- Implement a diff algorithm that classifies targets into unchanged, added, removed and statusChanged, based on id and identifying shape (dimension, kind, canonPath).
- Compute and present deltas for metrics.overall and metrics.byOperation between the two reports, highlighting regressions; metric deltas must be computed over the common universe of targets and dimensions (targets present in both reports and dimensions enabled on both sides), while targets from newly enabled dimensions are treated as added and reported explicitly.
- Identify newly uncovered targets (present in the newer report and uncovered, or that transitioned from hit:true to hit:false) and present them explicitly rather than folding into aggregate regressions.
- Ensure diff is only considered valid when both reports share the same coverage-report version and compatible FoundryData major (and, for byOperation deltas, a compatible operationsScope); otherwise surface a clear error.
- Provide a CLI entrypoint (e.g. foundrydata coverage diff A.json B.json) that prints a textual summary and can return a non-zero exit code on regressions if desired.

[Deliverables]
- Diff implementation in packages/reporter/src/coverage/coverage-diff.ts.
- CLI command wiring in packages/cli/src/commands/coverage-diff.ts.
- Tests and JSON fixtures for typical diff scenarios, including added/removed targets and status changes.

[Commands]
- npm run build
- npm run test -- --runInBand
- npm run test packages/reporter/src/coverage/__tests__/coverage-diff.spec.ts

[Definition of Done]
- coverage diff command correctly identifies target categories and metric deltas on synthetic and real coverage reports.
- Incompatible versions, engine majors or irreconcilable operationsScope differences are rejected with clear diagnostics, and diff does not attempt to compare incompatible reports.
- CLI output includes a concise summary of metrics.overall delta, per-operation regressions and lists of newly uncovered targets.
- Tests cover edge cases such as empty reports, operations added or removed, dimensions newly enabled or disabled and targets changing status to or from unreachable.

**Test Strategy:**

Unit tests for coverage diff classification using small synthetic reports; integration tests that run coverage twice on modified schemas and then call the diff command to validate reported deltas; tests for error handling when versions or engine majors are incompatible; snapshot tests for the CLI diff summary output.

## Subtasks

### 9311.9311001. Implement CoverageReport diff classification logic

**Status:** pending  
**Dependencies:** None  

Compare two CoverageReports and classify targets as unchanged, added, removed or statusChanged, including hit changes.

### 9311.9311002. Compute metric deltas and regressions

**Status:** pending  
**Dependencies:** None  

Compute changes in metrics.overall and metrics.byOperation over targets present in both reports (unchanged + statusChanged) and expose them in a diff summary structure, reporting newly added uncovered targets separately as new gaps.

### 9311.9311003. Add CLI command for foundrydata coverage diff

**Status:** pending  
**Dependencies:** None  

Add a CLI command that reads two JSON coverage reports, runs the diff and prints a human-readable summary.

### 9311.9311004. Add fixtures and tests for coverage diff behavior

**Status:** pending  
**Dependencies:** None  

Create JSON fixtures and tests for typical diff scenarios, including regressions and added/removed targets.
