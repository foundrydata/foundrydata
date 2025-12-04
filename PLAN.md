Task: 9502   Title: Add repair-philosophy diagnostics codes and metrics counters — subtask 9502.9502003
Anchors: [spec://§10#repair-philosophy, spec://§15#metrics, spec://§19#envelope]
Touched files:
- PLAN.md
- .taskmaster/docs/9502-traceability.md
- .taskmaster/tasks/tasks.json
- packages/reporter/src/engine/report-builder.ts
- packages/reporter/test/reporter.snapshot.test.ts
- packages/reporter/test/__snapshots__/reporter.snapshot.test.ts.snap
- agent-log.jsonl

Approach:
Pour la sous-tâche 9502.9502003, je vais aligner le reporter JSON/Markdown/HTML (et, indirectement, le CLI) avec les nouveaux diagnostics/métriques Repair sans changer la sémantique du pipeline. En m’appuyant sur `spec://§10#repair-philosophy`, `spec://§15#metrics` et `spec://§19#envelope`, je vais (1) vérifier que `buildReportFromPipeline` propage déjà les diagnostics `REPAIR_TIER_DISABLED` / `REPAIR_REVERTED_NO_PROGRESS` tels que fournis par le pipeline, et que `Report.metrics` reflète bien les nouveaux compteurs `repair_tier{1,2,3}_actions` et `repair_tierDisabled`, (2) ajuster au besoin les sérialiseurs/sanitiseurs côté reporter pour qu’ils tolèrent ces nouveaux champs numériquement (sans les filtrer) et n’introduisent pas de dépendance cachée à la coverage, (3) mettre à jour les snapshots de `packages/reporter/test/reporter.snapshot.test.ts` afin que le JSON Report, le Markdown et le HTML restent stables tout en acceptant la présence des métriques/diagnostics Repair supplémentaires, puis (4) relancer build/typecheck/lint/test/bench pour s’assurer que ces changements restent compatibles avec le CLI existant et que les gates de bench/diag-schema restent verts.

DoD:
- [x] Les rapports JSON/Markdown/HTML produits par le reporter incluent et tolèrent les nouveaux champs de métriques Repair (tiers + policy) et les diagnostics Repair-philosophy, sans casser les consommateurs existants ni exiger leur présence.
- [x] Les snapshots de tests du reporter sont mis à jour pour refléter la forme étendue de `Report.metrics` et des diagnostics, tout en conservant des valeurs numériques normalisées et stables.
- [x] Aucun nouveau code de sérialisation n’introduit de dépendance à l’état de coverage ou à un ordre non déterministe; les champs ajoutés restent purement observables.
- [x] La suite build/typecheck/lint/test/bench reste verte après ces changements, confirmant que reporter/CLI restent compatibles et conformes à l’enveloppe diagnostics/metrics.

Parent bullets couverts: [KR3, DEL3, DOD3, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
