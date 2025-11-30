# Traceability — Task 9324 (Add coverage-aware CLI examples and use cases docs)

This document maps the parent task 9324 bullets from Implementation Details and Test Strategy to its subtasks (starting with 9324.1).

## Parent bullets

### Implementation Details

- [KR1] Extend `docs/use-cases/product-scenarios.md` with scenarios (API mocks, contract tests, LLM testing) that illustrate coverage-aware runs in `coverage=measure` and `coverage=guided` modes, including basic report inspection.
- [KR2] Update `examples/README.md` with practical coverage-aware CLI examples using existing schemas (e.g. `ecommerce-schema.json`, `payment.json`, `users-api.json`) that show `coverage=off|measure|guided`, `--coverage-dimensions`, `--coverage-profile`, `--coverage-min` and `--coverage-report`.
- [KR3] Add a dedicated "Coverage-aware generation" subsection to `examples/README.md` that explains how profiles (`quick`, `balanced`, `thorough`) impact budgets and coverage depth, and how to combine them with thresholds and dimensions in CI-friendly commands.
- [KR4] Demonstrate observability and CI integration: `--print-metrics`, `--debug-passes`, and a small CI script (bash/YAML) that enforces a global coverage threshold by failing the build when `coverage.overall` falls below `minCoverage`.
- [KR5] Ensure all examples stay aligned with the implemented CLI options from `coverage-options.ts` (coverage mode, dimensionsEnabled, excludeUnreachable, minCoverage, reportPath, profile) and reference the coverage-aware spec sections on execution modes, reports and thresholds for deeper reading.

### Deliverables

- [DEL1] Updated `docs/use-cases/product-scenarios.md` containing at least one scenario explicitly using coverage-aware flags and describing how the coverage report is interpreted in that context.
- [DEL2] Updated `examples/README.md` with a "Coverage-aware generation" subsection and copy-pasteable CLI commands covering modes, dimensions, profiles, thresholds and report path usage.
- [DEL3] A documented CI snippet (GitHub Actions, GitLab CI, or generic bash) that runs coverage-aware CLI commands with `minCoverage` and shows how to gate a pipeline on coverage results.

### Definition of Done

- [DOD1] All CLI flags and modes referenced in the new documentation match the actual CLI behavior and naming in `coverage-options.ts`.
- [DOD2] Coverage-aware examples remain consistent with the coverage-report/v1 JSON structure (overall coverage, per-dimension metrics, thresholds) without redefining the full schema.
- [DOD3] Use-cases and examples stay focused and incremental: each example highlights one coverage feature (mode, profile, thresholds, observability) while cross-references help readers discover more advanced flows.

### Test Strategy

- [TS1] Manual review of `docs/use-cases/product-scenarios.md` and `examples/README.md` to verify accuracy of flags, modes, and profile descriptions against the coverage-aware spec and CLI implementation.
- [TS2] Run the documented CLI examples against the provided example schemas to ensure they execute without error and produce coverage reports in the expected shape.
- [TS3] Validate representative JSON coverage report snippets (when present) against the coverage-report/v1 contract from the coverage-aware spec (section on JSON coverage report and thresholds).
- [TS4] Check that CI snippets are syntactically valid for their target platform (or clearly marked as pseudo-code) and demonstrate the dedicated non-zero exit code when `minCoverage` is not met.
- [TS5] Confirm cross-references between `docs/use-cases/product-scenarios.md` and `examples/README.md` so readers can move between high-level scenarios and concrete CLI commands.

## Mapping 9324 subtasks → parent bullets

- **9324.1 – Implement coverage-aware CLI examples and docs**  
  Covers: [KR1], [KR2], [KR3], [KR4], [KR5], [DEL1], [DEL2], [DEL3], [DOD1], [DOD2], [DOD3], [TS1], [TS2], [TS3], [TS4], [TS5]. Status: covered (documentation and examples implemented; parent task 9324 can rely on this subtask for coverage-aware CLI docs and scenarios).
