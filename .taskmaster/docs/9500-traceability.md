# Traceability — Task 9500 (Integrate Repair philosophy into canonical spec and align design docs)

This document maps the parent task 9500 bullets from Implementation Details, Deliverables and Test Strategy to its subtasks 9500.9500001–9500.9500003.

## Parent bullets

### Implementation Details

- [KR1] Canonical spec §10 defines a single normative Repair philosophy layer (determinism tuple, tiers, default policy in and outside G_valid, coverage-independence, Score/commit rule, termination semantics) without contradicting the existing mapping `(keyword → action)` or the Generator/Repair contract in §6.
- [KR2] Design and architecture docs reference the canonical Repair philosophy section instead of re-stating or drifting from the normative text.
- [KR3] Diagnostics and metrics conventions around Repair tiers, budgets, stagnation and UNSAT are clearly tied back to the canonical spec (§10/§14/§15) and surfaced in docs where relevant.

### Deliverables

- [DEL1] `docs/spec-canonical-json-schema-generator.md` updated so that §10 contains an explicit “Repair philosophy” subsection that frames 10.P1–10.P8 and cross-references §6/§14/§15 without changing existing normative behavior.
- [DEL2] `docs/design-repair-philosophy.md` de-duplicated to point to the new canonical §10 anchors (tiers, Score/commit rule, coverage-independence, G_valid interaction) rather than carrying parallel normative prose.
- [DEL3] Diagnostics/metrics tables and tests traceability documents updated to include the new Repair philosophy-related diagnostics and metrics, and to link tests/fixtures back to the canonical anchors.

### Definition of Done

- [DOD1] There is a single, clearly identified canonical source for Repair philosophy (tiers, policy, Score/commit rule, coverage-independence, G_valid interaction) in §10 of the spec; other docs reference it instead of redefining semantics.
- [DOD2] All design and diagnostics/metrics docs that mention Repair behavior are aligned with the canonical spec, with no conflicting descriptions of what Repair is allowed to fix or how Score/budgets/UNSAT are interpreted.
- [DOD3] Build/typecheck/lint/test/bench remain green after the documentation changes, and no new obligations are imposed on the implementation beyond what the spec already requires.

### Test Strategy

- [TS1] Spec review and cross-reference checks ensure that §6/§10/§14/§15 and related design docs remain consistent (no diverging definitions of tiers, Score or G_valid/structuralKeywords behavior).
- [TS2] Diagnostics and metrics tables, along with any schema-based validators for diagnostics envelopes, are updated to account for Repair philosophy codes and metrics, and validated via tests.
- [TS3] Tests traceability and E2E tests referencing Repair tiers/Score/UNSAT behavior point back to the new §10 anchors and confirm that behavior is stable.

## Mapping 9500 subtasks → parent bullets

- **9500.9500001 – Patch canonical spec §10 with Repair philosophy section**  
  Covers: [KR1, DEL1, DOD1, TS1] (status: done).

- **9500.9500002 – De-duplicate design-repair-philosophy.md (reference canonical spec)**  
  Covers: [KR2, DEL2, DOD2, TS2] (status: done).

- **9500.9500003 – Extend diagnostics/metrics tables and traceability links**  
  Covers: [KR3, DEL3, DOD3, TS3] (status: done).
