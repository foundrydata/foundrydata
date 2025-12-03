Task: 9405   Title: Instrument Repair to emit motif-tagged usage events — subtask 9405.9405002
Anchors: [spec://§6#phases, spec://§6#generator-repair-contract, spec://§10#repair-engine, spec://§15#metrics-model, spec://§20#bench-gates]
Touched files:
- PLAN.md
- .taskmaster/docs/9405-traceability.md
- .taskmaster/tasks/tasks.json
- packages/core/src/repair/repair-engine.ts
- packages/core/src/repair/__tests__/mapping-repair.test.ts
- packages/core/src/util/metrics.ts

Approach:
Pour la sous-tâche 9405.9405002, je vais instrumenter le moteur de Repair afin d’émettre des événements d’usage par motif vers le modèle de métriques défini en 9405.9405001, sans encore modifier l’orchestrateur ni les reporters (spec://§6#phases, spec://§6#generator-repair-contract, spec://§10#repair-engine, spec://§15#metrics-model, spec://§20#bench-gates). Concrètement : (1) exploiter l’index de classification G_valid déjà disponible dans `repairItemsAjvDriven` pour dériver, à partir des `canonPath` utilisés par les actions de Repair, un couple stable `(motifId, gValid)` qui respecte le contrat Generator/Repair ; (2) à la fin du traitement de chaque item, calculer de manière déterministe le nombre d’actions appliquées par motif et G_valid, puis appeler une fois `metrics.recordRepairUsageEvent` pour chaque couple, en s’appuyant sur la logique d’agrégation existante côté `MetricsCollector` ; (3) veiller à ce que l’instrumentation reste strictement passive lorsque les métriques sont désactivées, qu’elle ne modifie jamais le comportement de Repair (aucun impact sur les diagnostics ni sur les décisions de Repair), et qu’elle n’introduise pas de dépendance nouvelle avec l’orchestrateur, qui sera traité en 9405.9405003 ; (4) étendre les tests de Repair déjà présents (schémas G_valid vs non-G_valid) pour vérifier que des snapshots de métriques contiennent bien des entrées cohérentes dans `repairUsageByMotif` lorsque le collector est activé, tout en gardant les reporters et benchs verts.

DoD:
- [x] Le moteur de Repair appelle `recordRepairUsageEvent` avec des couples `(motifId, gValid, actions)` dérivés de l’index G_valid et des actions effectivement appliquées, sans modifier le comportement fonctionnel de Repair.
- [x] Les métriques restent inactives lorsque le collector est désactivé, et l’instrumentation ne crée pas de dépendance nouvelle avec l’orchestrateur ou les reporters (traités dans 9405.9405003/9405.9405004).
- [x] Des tests ciblés vérifient que, pour des schémas G_valid et non-G_valid, les snapshots de métriques contiennent des entrées cohérentes dans `repairUsageByMotif` (items, itemsWithRepair, actions) lorsqu’un collector est fourni.
- [x] La suite build/typecheck/lint/test/bench reste verte après l’ajout de l’instrumentation et des tests, confirmant que le modèle de métriques est alimenté correctement sans régression.

Parent bullets couverts: [KR1, KR2, DEL2, DOD1, DOD2, TS1, TS2]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
