Task: 9502   Title: Add repair-philosophy diagnostics codes and metrics counters — subtask 9502.9502002
Anchors: [spec://§10#repair-philosophy, spec://§15#metrics, spec://§19#envelope]
Touched files:
- PLAN.md
- .taskmaster/docs/9502-traceability.md
- .taskmaster/tasks/tasks.json
- packages/core/src/util/metrics.ts
- packages/core/src/util/repair-usage-metrics.ts
- packages/core/src/util/__tests__/metrics.test.ts
- packages/reporter/test/__snapshots__/reporter.snapshot.test.ts.snap
- agent-log.jsonl

Approach:
Pour la sous-tâche 9502.9502002, je vais étendre la collecte de métriques pour exposer des compteurs Repair alignés avec la philosophie (actions par tier et blocages/reverts de policy) dans le snapshot metrics. En m’appuyant sur `spec://§10#repair-philosophy` et `spec://§15#metrics`, je vais (1) ajouter, dans `packages/core/src/util/metrics.ts`, des champs explicites pour `repair_tier1_actions`, `repair_tier2_actions`, `repair_tier3_actions` et `repair_tierDisabled` (ainsi que, si pertinent, un compteur pour les reverts Score) dans la structure de metrics collectées, (2) implémenter des helpers pour incrémenter ces compteurs de manière déterministe lorsque le moteur de Repair enregistre des actions ou des diagnostics `REPAIR_TIER_DISABLED`/`REPAIR_REVERTED_NO_PROGRESS`, sans introduire de dépendances à la coverage, (3) compléter ou créer `packages/core/src/util/__tests__/metrics.test.ts` pour vérifier que, pour un set artificiel d’événements Repair, les compteurs sont correctement initialisés à 0, incrémentés de façon stable et inclus dans le snapshot final, puis (4) relancer build/typecheck/lint/test/bench pour garantir que ces nouveaux champs n’affectent pas les reporters/CLIs existants et respectent les contraintes de déterminisme et de budget de §15.

DoD:
- [x] La structure de metrics inclut des compteurs explicites pour les actions Repair par tier (Tier1/2/3) et pour les cas de tiers désactivés, avec des noms alignés sur la SPEC et des valeurs initiales cohérentes.
- [x] Les helpers de metrics utilisables depuis Repair incrémentent ces compteurs de manière déterministe pour un tuple de déterminisme donné, sans double comptage ni dépendance à l’ordre des événements.
- [x] Les tests de metrics vérifient que, pour un scénario synthétique, les compteurs évoluent comme attendu et apparaissent dans le snapshot final, et que l’ajout de ces champs ne casse pas les usages existants.
- [x] La suite build/typecheck/lint/test/bench reste verte après ces changements, confirmant que les compteurs de metrics Repair sont correctement intégrés.

Parent bullets couverts: [KR2, DEL2, DOD2, TS2]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
