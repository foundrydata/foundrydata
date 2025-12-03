Task: 9406   Title: Add G_valid-related options to PlanOptions and core API — subtask 9406.9406001
Anchors: [spec://§6#phases, spec://§6#generator-repair-contract, spec://§10#repair-engine, spec://§15#metrics-model]
Touched files:
- PLAN.md
- .taskmaster/docs/9406-traceability.md
- .taskmaster/tasks/tasks.json
-,packages/core/src/types/options.ts
- packages/core/src/pipeline/types.ts
- packages/core/src/pipeline/orchestrator.ts
- packages/core/src/index.ts

Approach:
Pour la sous-tâche 9406.9406001, je vais étendre `PlanOptions` et les types de l’API core pour exposer explicitement les options G_valid et le contrôle de la sévérité du Repair en zone G_valid, puis les injecter dans le contexte du pipeline de manière rétrocompatible (spec://§6#phases, spec://§6#generator-repair-contract, spec://§10#repair-engine, spec://§15#metrics-model). Concrètement : (1) compléter `PlanOptions` dans `packages/core/src/types/options.ts` avec des champs G_valid clairement typés (activation de la classification, strictness du Repair en zone G_valid) et s’assurer que `resolveOptions` fournit des valeurs par défaut qui reproduisent le comportement actuel quand G_valid est désactivé ; (2) propager ces options dans les types de pipeline (`PipelineOptions`, éventuels wrappers CLI) et dans l’orchestrateur (`executePipeline`) pour que les instances de `MetricsCollector`, du moteur de Repair et du générateur puissent les consommer sans changement de signature invasif ; (3) mettre à jour l’API publique dans `packages/core/src/index.ts` pour documenter ces options G_valid côté Node API, en gardant l’API existante intacte (options optionnelles, champs additionnels seulement) ; (4) ajouter des tests unitaires ciblés (par exemple dans les tests de `options` et, si nécessaire, un test d’orchestrateur minimal) pour vérifier la résolution des defaults, le passage des flags et l’absence de régression sur les scénarios sans G_valid, avant de valider la suite build/typecheck/lint/test/bench.

DoD:
- [ ] `PlanOptions` expose des champs G_valid et Repair strictness avec des valeurs par défaut rétrocompatibles et une résolution claire via `resolveOptions`.
- [ ] Les types de pipeline et l’orchestrateur reçoivent et transmettent ces options G_valid sans casser les signatures existantes ni les comportements quand G_valid est désactivé.
- [ ] L’API publique Node (index core) documente et exporte ces options G_valid, et des tests unitaires vérifient la bonne résolution et le passage des flags.
- [ ] La suite build/typecheck/lint/test/bench reste verte après l’ajout de ces options et tests, confirmant que la configuration G_valid est opérationnelle sans régression.

Parent bullets couverts: [KR1, DEL1, DOD1, TS1]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
