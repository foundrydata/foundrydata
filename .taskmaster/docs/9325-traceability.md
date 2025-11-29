# 9325 Traceability

## Context
- [C1] Implement proactive detection of structurally impossible coverage hints before generation, keeping the analyzer/planner pipeline and diagnostics aligned with the coverage-aware spec.

## Key requirements
- [KR1] Extend CoverageAnalyzer to flag property, branch and enum coverage targets that are provably unreachable from not/allOf/required contradictions, unsatisfied diagnostics, or AP:false CoverageIndex gaps.
- [KR2] Teach CoveragePlanner.buildHintsForTarget to skip unreachable targets, validate hints against CoverageIndex bounds and discovered UNSAT paths, and correlate conflicting hints with CONFLICTING_CONSTRAINTS diagnostics via a reusable ConflictDetector helper.
- [KR3] Surface the early conflicting hints in the orchestrator so they are merged into CoverageReport.unsatisfiedHints, keep coverage metrics unchanged, and document the heuristics as a conservative guardrail (conflicts remain diagnostic-only).

## Implementation notes
- [IM1] Keep the conflict check deterministic and side-effect-free, reusing Compose diagnostics for proof, avoiding any extra solver work, and keeping the cost linear in the number of hints.

## Test strategy
- [TS1] Cover ConflictDetector and the planner flow with targeted unit cases, and add guided planning integration tests that assert a CONFLICTING_CONSTRAINTS entry reaches the coverage report without altering metrics.

## Mapping 9325.1 → parent bullets
| Subtask | Parent bullets | Status |
| 9325.1 | [KR1, KR2, KR3, IM1, TS1] | in-progress |
