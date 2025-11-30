# Traceability — Task 9322 (Extend invariants and architecture docs for coverage-aware pipeline)

This document maps the parent task 9322 bullets from Implementation Details, Deliverables, Definition of Done and Test Strategy to its subtasks 9322.9322001–9322.9322003.

## Parent bullets

### Implementation Details

- [KR1] Add a dedicated "Coverage invariants" section to `docs/Invariants.md` that captures CoverageTarget ID determinism, dimension semantics (`structure`, `branches`, `enum`, `boundaries`, `operations`), status values (`'active'`, `'unreachable'`, `'deprecated'`), metrics behavior under `dimensionsEnabled` / `excludeUnreachable`, and the guarantee that diagnostic-only targets are excluded from coverage denominators.
- [KR2] Describe streaming coverage instrumentation as an invariant: per-instance coverage state, commit-after-validate behavior, no second JSON parse, no additional network I/O, and reuse of the original AJV instance as oracle.
- [KR3] Extend `ARCHITECTURE.md` with coverage-specific modules and data flow: CoverageAnalyzer between Compose and Generate, CoveragePlanner/hints for `coverage=guided`, CoverageEvaluator and coverage-report/v1, and the streaming instrumentation that attaches to the Generate/Repair/Validate stages.
- [KR4] Add an optional coverage-aware step to `EVALUATION.md` so that users evaluating FoundryData can quickly enable coverage and inspect a coverage-report/v1 (without turning coverage into a hard dependency of the base evaluation path).

### Deliverables

- [DEL1] Updated `docs/Invariants.md` with a "Coverage invariants" section that is consistent with the coverage-aware spec and existing core invariants.
- [DEL2] Updated `ARCHITECTURE.md` documenting coverage-aware components and their place in the Normalize → Compose → Generate → Repair → Validate pipeline.
- [DEL3] Updated `EVALUATION.md` including an optional step (or short subsection) that shows how to enable coverage in the CLI, generate a coverage-report/v1, and read high-level metrics.

### Definition of Done

- [DOD1] Coverage invariants in `docs/Invariants.md` accurately reflect the behavior of the coverage implementation and the coverage-aware spec (no contradictions with existing pipeline invariants).
- [DOD2] Coverage-aware modules and flows described in `ARCHITECTURE.md` match the actual wiring in `@foundrydata/core` and `@foundrydata/shared` (stages, entry points, and artifacts).
- [DOD3] The evaluation flow documented in `EVALUATION.md` includes an optional coverage step that remains copy-pasteable and does not break when coverage is disabled.

### Test Strategy

- [TS1] Manual doc review of `docs/Invariants.md` against the coverage-aware spec and core code paths that implement CoverageTarget IDs, dimensions, statuses and metrics.
- [TS2] Manual doc review of `ARCHITECTURE.md` to ensure coverage-aware diagrams and text stay in sync with the current code.
- [TS3] Quick manual run of the evaluation steps (including the optional coverage step) to confirm the referenced commands still work and produce coverage reports in the expected shape.

## Mapping 9322 subtasks → parent bullets

- **9322.9322001 – Add coverage invariants section to Invariants.md**  
  Covers: [KR1], [KR2], [DEL1], [DOD1], [TS1]. Status: covered (Invariants.md now includes a dedicated coverage invariants section aligned with the coverage-aware spec, target semantics and instrumentation behavior).

- **9322.9322002 – Extend ARCHITECTURE.md with coverage-aware modules**  
  Covers: [KR3], [DEL2], [DOD2], [TS2]. Status: covered (ARCHITECTURE.md now describes coverage-aware modules and their position in the pipeline, including Analyzer, Planner, Evaluator and streaming instrumentation, consistent with the implemented wiring and coverage-aware spec).

- **9322.9322003 – Add optional coverage step to EVALUATION.md**  
  Covers: [KR4], [DEL3], [DOD3], [TS3]. Status: covered (EVALUATION.md now contains an optional coverage step showing how to run coverage=measure on a real schema, read the CLI summary and inspect a coverage-report/v1 without making coverage mandatory for the base evaluation flow).
