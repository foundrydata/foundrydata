Task: 9505   Title: Add coverage-independence and determinism regression tests for Repair — subtask 9505.9505003
Anchors: [spec://§10#repair-philosophy, spec://§10#repair-philosophy-coverage-independence, spec://§6#phases, spec://§15#rng, spec://§15#metrics]
Touched files:
- PLAN.md
- .taskmaster/docs/9505-traceability.md
- .taskmaster/tasks/tasks.json
- packages/core/src/pipeline/__tests__/repair-determinism-fixture.test.ts
- agent-log.jsonl

Approach:
Pour la sous-tâche 9505.9505003, je vais préparer un chemin de fixture pré-Repair déterministe qui permet d’injecter un flux d’instances candidates figé dans Repair afin de tester la stabilité des décisions et du Score sans dépendre du générateur ou de la couverture. En m’appuyant sur `spec://§10#repair-philosophy`, `spec://§10#repair-philosophy-coverage-independence`, `spec://§6#phases`, `spec://§15#rng` et `spec://§15#metrics`, je vais (1) introduire un petit helper de test (ou un wrapper pipeline de test-only) qui, pour un schéma et un tuple de paramètres, exécute `executePipeline` une première fois, capture les instances candidates juste avant Repair et les réutilise comme fixture dans des runs suivants, (2) ajouter un test dédié dans `repair-determinism-fixture.test.ts` qui exécute plusieurs fois la boucle de Repair sur ces mêmes instances pré-Repair, avec les mêmes options (coverage=off/measure fixés), et vérifie que `artifacts.repaired`, `artifacts.repairActions`, `artifacts.repairDiagnostics` et les métriques Repair (Score, `repairPassesPerRow`, `repairActionsPerRow`) restent strictement identiques, (3) s’assurer que le helper est pur côté tests (pas de mutation de global state, pas d’API réseau, pas de dépendance à coverageMode/dimensionsEnabled en dehors de la configuration passée), et (4) rejouer build/typecheck/lint/test/bench pour valider que ces tests de déterminisme n’introduisent ni flakiness ni divergence de Score, tout en documentant le lien avec KR3/DEL3/DOD3/TS3 dans la trace 9505.

DoD:
- [x] Un helper ou wrapper de test permet d’injecter un flux d’instances pré-Repair figé dans la boucle de Repair sans modifier la sémantique du pipeline en production ni dépendre de l’état de coverage.
- [x] Au moins un test pipeline-level utilise ce helper pour exécuter plusieurs runs de Repair sur les mêmes instances candidates et vérifie que `artifacts.repaired`, `artifacts.repairActions` et `artifacts.repairDiagnostics` restent strictement identiques.
- [x] Les métriques Repair pertinentes (`repairPassesPerRow`, `repairActionsPerRow` et compteurs de tiers s’ils sont exposés) restent identiques sur ces runs répétés, montrant l’absence de non-déterminisme caché pour un tuple de paramètres donné.
- [x] La suite build/typecheck/lint/test/bench est verte avec ces nouveaux tests de déterminisme, et la trace 9505 documente qu’ils couvrent la partie KR3/DEL3/DOD3/TS3 de la coverage-independence et de la stabilité de Repair.

Parent bullets couverts: [KR3, DEL3, DOD3, TS3]

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
