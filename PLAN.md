Task: 9405   Title: Aggregate and expose repair usage metrics in pipeline orchestrator — subtask 9405.9405003
Anchors: [spec://§6#phases, spec://§6#generator-repair-contract, spec://§10#repair-engine, spec://§15#metrics-model, spec://§20#bench-gates]
Touched files:
- PLAN.md
- .taskmaster/docs/9405-traceability.md
- .taskmaster/tasks/tasks.json
- packages/core/src/pipeline/types.ts
- packages/core/src/pipeline/orchestrator.ts
- packages/core/src/pipeline/__tests__/pipeline-orchestrator.test.ts

Approach:
Pour la sous-tâche 9405.9405003, je vais brancher le modèle `RepairUsageByMotif` sur l’orchestrateur de pipeline afin que les métriques d’usage du Repair par motif et G_valid soient agrégées par exécution et exposées au même niveau que les compteurs de temps/validation existants (spec://§6#phases, spec://§6#generator-repair-contract, spec://§10#repair-engine, spec://§15#metrics-model, spec://§20#bench-gates). Concrètement : (1) faire remonter, depuis le moteur de Repair déjà instrumenté, les snapshots `repairUsageByMotif` via le `MetricsCollector` que l’orchestrateur crée ou reçoit, en étendant les types de `PipelineResult`/`metrics` de façon strictement rétrocompatible ; (2) veiller à ce que les nouvelles métriques restent optionnelles et absentes par défaut dans les snapshots reporters existants pour ne pas casser les tests de snapshot, tout en permettant aux profils de bench et aux tests ciblés d’y accéder en mode `ci` ; (3) ajouter ou compléter des tests dans `pipeline-orchestrator.test.ts` qui valident l’agrégation correcte des métriques d’usage du Repair sur un petit schéma G_valid et un schéma non-G_valid, sans dépendre des reporters, en inspectant directement l’objet de sortie du pipeline ; (4) revalider la suite build/typecheck/lint/test/bench pour confirmer que l’exposition de ces métriques ne dégrade ni les performances ni les contrats existants, et préparer ainsi le terrain pour les e2e et la traçabilité G_valid de 9405.9405004.

DoD:
DoD:
- [ ] Les métriques `repairUsageByMotif` sont exposées dans la structure de résultat du pipeline (types et implémentation) de manière optionnelle et rétrocompatible.
- [ ] Les tests de l’orchestrateur couvrent au moins un cas G_valid et un cas non-G_valid, en vérifiant que les compteurs par motif et G_valid se propagent correctement depuis le `MetricsCollector`.
- [ ] Les reporters et benchs existants restent stables (snapshots/contrats inchangés), tout en pouvant consommer les métriques d’usage du Repair lorsque le mode `ci` est actif.
- [ ] La suite build/typecheck/lint/test/bench reste verte après l’ajout de l’agrégation et de l’exposition, confirmant que l’intégration au pipeline respecte le modèle de métriques global.

Parent bullets couverts: [KR2, KR3, DEL3, DOD2, TS2, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
