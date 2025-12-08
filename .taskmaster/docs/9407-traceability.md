# Traceability — Task 9407 (Extend G_valid beyond v1)

This document maps the parent task 9407 bullets from Implementation Details, Deliverables and Test Strategy to its subtasks 9407.1–9407.5.

## Parent bullets

### Implementation Details

- [KR1] Define extended G_valid motif types for simple conditional objects (`if` / `then` / `else` with deterministic guards) and discriminated union objects (`oneOf` with discriminator property) in the classifier.
- [KR2] Update the G_valid classifier predicates so that extended motifs are recognized only when v1 eligibility and AP:false / unevaluated* exclusion rules are respected.
- [KR3] Extend the generator to honor extended G_valid motifs by producing structurally complete instances (required fields, conditional branches, discriminator values) without relying on structural Repair in strict posture.
- [KR4] Update the repair engine policy so that structural actions in extended G_valid zones are blocked by default, emitting diagnostics rather than modifying shape, while keeping non-structural repairs allowed.
- [KR5] Instrument metrics and reporter gates so that extended G_valid motifs contribute motif-tagged repairUsageByMotif entries and G_valid counters, and so that structural Repair in these zones is surfaced as a CI gate failure.

### Deliverables

- [DEL1] Extended G_valid motif definitions and predicates implemented in `packages/core/src/transform/g-valid-classifier.ts`.
- [DEL2] Generator changes in `packages/core/src/generator/foundry-generator.ts` ensuring that simple conditional and discriminated union motifs are treated as G_valid (complete by construction) when the feature flag is enabled.
- [DEL3] Repair policy updates in `packages/core/src/repair/repair-engine.ts` plus regression tests covering structural blocking and relaxed behaviour in extended G_valid zones.
- [DEL4] Metrics and reporter wiring for extended motifs, including motif-level counters and gate coverage in reporter tests.
- [DEL5] Fixtures, acceptance tests and documentation that exercise extended motifs end-to-end and describe their current support level.

### Definition of Done

- [DOD1] Extended motifs (simple conditional and discriminated union objects) are classified as G_valid only when their schemas satisfy the extension criteria and do not widen the v1 scope beyond spec allowances.
- [DOD2] In strict G_valid posture, Generator produces structurally complete instances for extended motifs and Repair does not perform structural changes in these zones; any attempt is surfaced via diagnostics and metrics.
- [DOD3] Metrics and reporter gates surface structural Repair in extended G_valid zones (including new motifs) as failures, and no existing v1 G_valid tests regress.
- [DOD4] Acceptance tests and documentation clearly identify the extended motifs covered by this task and their interaction with the Generator vs Repair contract.

### Test Strategy

- [TS1] Classifier unit tests covering positive and negative cases for simple conditional and discriminated union motifs, plus regression checks for v1 motifs.
- [TS2] Generator tests (unit or pipeline-level) that assert extended motifs yield structurally complete instances without Repair actions in strict posture.
- [TS3] Repair engine tests that verify structural actions are blocked in extended G_valid zones by default, and that relaxed posture allows them with correct metrics.
- [TS4] Acceptance tests combining v1 and extended motifs, checking metrics.repairUsageByMotif and reporter gates for G_valid zones.
- [TS5] Bench and determinism checks re-used from existing G_valid suites to ensure no regressions in performance or seed-based determinism when extended motifs are enabled.

## Mapping 9407 subtasks → parent bullets

- **9407.1 – Define extended motif types and update G_valid classifier predicates**  
  Covers: [KR1, KR2, DEL1, DOD1, TS1] (status: covered — classifier + unit tests en place pour motifs conditionnels simples et unions discriminées, v1 non régressé).

- **9407.2 – Extend generator to honor extended G_valid motifs and emit complete instances**  
  Covers: [KR3, DEL2, DOD2, TS2, TS5] (status: covered — générateur étendu pour motifs conditionnels/unions discriminées, tests pipeline vérifiant instances complètes, déterminisme conservé).

- **9407.3 – Update repair engine policy to respect extended G_valid zones**  
  Covers: [KR4, DEL3, DOD2, TS3] (status: covered — garde structurelle G_valid appliquée aux motifs étendus, diagnostics REPAIR_GVALID_STRUCTURAL_ACTION / REPAIR_TIER_DISABLED testés).

- **9407.4 – Instrument extended motif metrics and update reporter gates**  
  Covers: [KR5, DEL4, DOD3, TS4] (status: covered — métriques gValid_* et repairUsageByMotif pour motifs étendus, snapshots reporter et gates GVALID_REPAIR verts).

- **9407.5 – Add test fixtures, acceptance tests, and documentation for extended G_valid motifs**  
  Covers: [KR1, KR3, KR5, DEL5, DOD4, TS2, TS4, TS5] (status: partially-covered — fixtures + tests d’acceptance et documentation COMPREHENSIVE_FEATURE_SUPPORT.md en place pour motifs étendus; section SPEC détaillée et suites supplémentaires possibles dans une tâche ultérieure si besoin).
