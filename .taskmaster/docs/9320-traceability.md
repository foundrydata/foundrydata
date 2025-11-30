# Traceability — Task 9320 (Document coverage-aware modes and CLI usage in README)

This document maps the parent task 9320 bullets from Implementation Details, Deliverables, Definition of Done and Test Strategy to its subtasks 9320.9320001–9320.9320003.

## Parent bullets

### Implementation Details

- [KR1] Add a dedicated "Coverage-aware generation" section explaining coverage modes (`coverage=off`, `coverage=measure`, `coverage=guided`), `dimensionsEnabled`, `excludeUnreachable` and `minCoverage` semantics at a high level.
- [KR2] Extend the CLI section with coverage flags (`--coverage`, `--coverage-dimensions`, `--coverage-min`, `--coverage-report`, `--coverage-profile`, `--coverage-exclude-unreachable`) and example commands for JSON Schema and OpenAPI entrypoints.
- [KR3] Explain where coverage reports are written (CLI `--coverage-report` path vs Node API Promise) and how they relate to the coverage-report/v1 spec document (`docs/spec-coverage-aware-v1.x.md`).
- [KR4] Keep the README balanced: coverage is an opt-in feature layered on top of the existing pipeline, not a separate product.

### Deliverables

- [DEL1] Updated `README.md` with a "Coverage-aware generation" section placed under or near the existing "How it works" / "CLI" sections.
- [DEL2] CLI section extended with coverage flags and working examples for JSON Schema and OpenAPI entrypoints.
- [DEL3] Node.js API section updated to mention coverage-report/v1 outputs and where coverage reports are written (file path vs returned Promise).
- [DEL4] Smoke script or CI step that runs README CLI examples (including coverage-aware ones) to assert they stay valid over time.

### Definition of Done

- [DOD1] `README.md` clearly explains coverage modes, `dimensionsEnabled`, `excludeUnreachable` and `minCoverage` semantics consistent with the coverage-aware spec.
- [DOD2] `README.md` documents coverage CLI flags and examples that match the implemented behavior of the CLI and Node API.
- [DOD3] Coverage documentation remains positioned as an opt-in layer; existing non-coverage usage paths remain valid and are not overshadowed.
- [DOD4] README content and examples are internally consistent with the coverage-report/v1 structure and location, including the link to `docs/spec-coverage-aware-v1.x.md`.

### Test Strategy

- [TS1] Manual review of `README.md` to confirm clarity, correct usage and alignment with the coverage-aware spec.
- [TS2] Automated smoke script that executes CLI examples from `README.md` in CI (including coverage-aware examples) to ensure they remain valid over time.

## Mapping 9320 subtasks → parent bullets

- **9320.9320001 – Add coverage overview and modes to README**  
  Covers: [KR1], [DEL1], [DOD1], [TS1]. Status: covered (coverage-aware overview and modes documented; CLI and Node-specific details remain scoped to 9320.9320002–9320.9320003).

- **9320.9320002 – Document CLI coverage flags and examples in README**  
  Covers: [KR2], [DEL2], [DOD2], [TS2].

- **9320.9320003 – Describe Node API access to coverage reports**  
  Covers: [KR3], [DEL3], [DOD3], [DOD4], [TS1].

