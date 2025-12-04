Task: 9505   Title: Add coverage-independence and determinism regression tests for Repair — subtask 9505.9505001
Anchors: [spec://§10#repair-philosophy, spec://§10#repair-philosophy-coverage-independence, spec://§6#phases, cov://§3#coverage-model]
Touched files:
- PLAN.md
- .taskmaster/docs/9505-traceability.md
- .taskmaster/tasks/tasks.json
- packages/core/src/pipeline/__tests__/repair-coverage-independence.test.ts
- agent-log.jsonl

Approach:
Pour la sous-tâche 9505.9505001, je vais ajouter un test d’intégration centré sur la couverture-indépendance de Repair qui compare coverage=off et coverage=measure sur un même schéma/seed/options, en gardant la phase Repair isolée du planning coverage. En m’appuyant sur `spec://§10#repair-philosophy`, `spec://§10#repair-philosophy-coverage-independence`, `spec://§6#phases` et `cov://§3#coverage-model`, je vais (1) introduire un test `repair-coverage-independence.test.ts` dans `packages/core/src/pipeline/__tests__` qui appelle `executePipeline` avec un petit schéma déclenchant des réparations simples (numeric bounds + required) pour un seed fixé, d’abord avec `coverage:{ mode:'off' }`, puis avec `coverage:{ mode:'measure', dimensionsEnabled:['structure','branches','enum'] }`, (2) figer les options (mode strict, même seed, mêmes PlanOptions) et comparer en profondeur `artifacts.repaired`, `artifacts.repairActions` et `artifacts.repairDiagnostics` entre les deux runs, en tolérant uniquement les différences attendues sur les artefacts de coverage (`coverageGraph`, `coverageMetrics`, etc.), (3) vérifier également que les métriques Repair pertinentes (`repairPassesPerRow`, compteurs de tiers) restent identiques entre off et measure, en s’assurant que le test ne dépend ni des cibles coverage ni de `dimensionsEnabled` pour la partie Repair, puis (4) rejouer build/typecheck/lint/test/bench pour verrouiller que ce test démontre bien l’indépendance de Repair vis‑à‑vis des réglages coverage dans le profil nominal.

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
