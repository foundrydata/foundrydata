Task: 9405   Title: Define repair usage metrics model by motif and G_valid flag — subtask 9405.9405001
Anchors: [spec://§6#phases, spec://§6#generator-repair-contract, spec://§10#repair-engine, spec://§15#metrics-model, spec://§20#bench-gates]
Touched files:
- PLAN.md
- .taskmaster/docs/9405-traceability.md
- .taskmaster/tasks/tasks.json
- packages/core/src/util/metrics.ts
- packages/core/src/pipeline/types.ts

Approach:
Pour la sous-tâche 9405.9405001, je vais définir le modèle de métriques pour l’usage du Repair par motif et indicateur G_valid, et l’intégrer dans les types de métriques existants sans encore instrumenter le moteur de Repair (spec://§6#phases, spec://§6#generator-repair-contract, spec://§10#repair-engine, spec://§15#metrics-model, spec://§20#bench-gates). Concrètement : (1) introduire dans `util/metrics.ts` un type dédié au suivi de l’usage du Repair par motif (par exemple motif id, drapeau G_valid, nombre d’items, nombre d’items ayant au moins une action de Repair, nombre total d’actions) et le raccrocher à la structure de snapshot existante via un champ optionnel clairement documenté ; (2) ajouter, côté `MetricsCollector`, les compteurs internes et les helpers nécessaires pour enregistrer ultérieurement des événements par motif, sans encore modifier le code de Repair ; (3) étendre les types de métriques exposés par le pipeline dans `pipeline/types.ts` pour inclure ces nouvelles métriques, en veillant à ce que les call sites et tests existants (notamment ceux qui valident la forme de `coverageMetrics` ou de `metrics.overall`) restent compatibles ; (4) revalider la suite build/typecheck/lint/test/bench pour s’assurer que l’ajout de ces types n’introduit pas de régression et que le modèle est prêt à être alimenté par 9405.9405002/9405.9405003.

DoD:
- [ ] Un type de métriques structuré pour l’usage du Repair par motif (incluant l’indicateur G_valid) est défini et relié au snapshot de métriques existant.
- [ ] `MetricsCollector` expose les hooks nécessaires pour incrémenter ces métriques par motif sans que le reste du code soit affecté.
- [ ] Les types de métriques exposés par le pipeline intègrent le nouveau modèle sans casser les tests existants ni les consommateurs.
- [ ] La suite build/typecheck/lint/test/bench reste verte après l’ajout de ces types, confirmant que le modèle est prêt pour l’instrumentation.

Parent bullets couverts: [KR1, DEL1, DOD1, TS1]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
