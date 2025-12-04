Task: 9505   Title: Add coverage-independence and determinism regression tests for Repair — subtask 9505.9505002
Anchors: [spec://§10#repair-philosophy, spec://§10#repair-philosophy-coverage-independence, spec://§6#phases, cov://§3#coverage-model]
Touched files:
- PLAN.md
- .taskmaster/docs/9505-traceability.md
- .taskmaster/tasks/tasks.json
- packages/core/src/pipeline/__tests__/repair-coverage-independence.test.ts
- agent-log.jsonl

Approach:
Pour la sous-tâche 9505.9505002, je vais étendre les tests pour démontrer que des profils `dimensionsEnabled` différents en mode coverage=measure n’affectent pas le comportement de Repair pour un même schéma/seed/options. En m’appuyant sur `spec://§10#repair-philosophy`, `spec://§10#repair-philosophy-coverage-independence`, `spec://§6#phases` et `cov://§3#coverage-model`, je vais (1) ajouter un second test dans `repair-coverage-independence.test.ts` qui exécute `executePipeline` avec coverage=measure et deux configurations de `dimensionsEnabled` (par exemple `['structure']` vs `['structure','branches','enum']`) sur le même schéma conditionnel et le même seed, (2) comparer en profondeur `artifacts.repaired`, `artifacts.repairActions` et `artifacts.repairDiagnostics` entre les deux runs, en tolérant uniquement les différences attendues sur les artefacts coverage (`coverageTargets`, `coverageMetrics`, `coverageReport`), (3) vérifier que les métriques Repair pertinentes (`repairPassesPerRow`, `repairActionsPerRow`, compteurs de tiers si présents) restent identiques entre ces profils de dimensions, et (4) rejouer build/typecheck/lint/test/bench pour s’assurer que le test est stable, déterministe et qu’il n’introduit aucune dépendance implicite aux détails internes de CoverageAnalyzer.

DoD:
- [x] Pour un schéma et un seed donnés, deux runs coverage=measure avec des profils `dimensionsEnabled` différents produisent des `artifacts.repaired`, `artifacts.repairActions` et `artifacts.repairDiagnostics` identiques, les seules différences admises portant sur les artefacts coverage.
- [x] Les métriques Repair (au minimum `repairPassesPerRow`, `repairActionsPerRow` et, si présents, les compteurs de tiers) restent identiques entre ces profils de dimensions, montrant que Repair ne dépend pas de `dimensionsEnabled` pour ses décisions.
- [x] Le test reste stable et déterministe pour un tuple de paramètres fixé, sans assertions sur les détails internes de CoverageAnalyzer (graphes ou cibles).
- [x] La suite build/typecheck/lint/test/bench est verte après l’ajout de ce test d’invariance, et la trace 9505 documente qu’il couvre la partie dimensionsEnabled de la coverage-independence de Repair.

Parent bullets couverts: [KR2, DEL2, DOD2, TS2]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true

DoD:
- [x] Pour un schéma et un seed donnés, `executePipeline` retourne des `artifacts.repaired`, `artifacts.repairActions` et `artifacts.repairDiagnostics` identiques entre coverage=off et coverage=measure (mêmes options et même tuple de déterminisme), les seules différences admises portant sur les artefacts coverage.
- [x] Les métriques Repair (au minimum `repairPassesPerRow`, compteurs de tiers s’ils sont présents) restent identiques entre les deux runs, montrant que Repair ne dépend ni de coverageMode ni de dimensionsEnabled pour ses décisions.
- [x] Le test n’introduit pas de dépendance aux détails internes du CoverageAnalyzer (pas d’assertions sur `coverageGraph` ou `coverageTargets`), et reste stable et déterministe dans le temps.
- [x] La suite build/typecheck/lint/test/bench est verte après l’ajout de ce test d’équivalence, et le test est documenté dans la trace 9505 comme couvrant la partie off vs measure de la coverage-independence de Repair.

Parent bullets couverts: [KR1, DEL1, DOD1, TS1]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
