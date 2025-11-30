Task: 9331   Title: Extract a dedicated coverage runtime from the pipeline orchestrator — subtask 9331.9331002
Anchors: [cov://§3#coverage-model, cov://§4#architecture-components, cov://§4#coverage-planner]
Touched files:
- packages/core/src/pipeline/orchestrator.ts
- packages/core/src/coverage/runtime.ts
- packages/core/src/pipeline/__tests__/pipeline-orchestrator.test.ts
- .taskmaster/docs/9331-traceability.md

Approach:
Pour la sous-tâche 9331.9331002, je vais refactoriser `executePipeline` pour déléguer la planification et l’évaluation coverage au module `coverage/runtime.ts`, tout en conservant strictement la séquence des phases et la forme des artefacts existants (cov://§3#coverage-model, cov://§4#architecture-components, cov://§4#coverage-planner). Concrètement : (1) remplacer le bloc inline de la phase Compose qui appelle `analyzeCoverage`, applique les caps du planner et prépare `coverageTargets` par un appel à `planCoverageForPipeline`, en réutilisant les mêmes entrées (canonical schema, `ptrMap`, `coverageIndex`, `planDiag`, options coverage/generate, extra hints de tests) et en réinjectant `coverageGraph`, `coverageTargets`, `plannerCapsHit` et `unsatisfiedHints` dans les artefacts du pipeline; (2) conserver le câblage existant des hooks coverage (`coverageHookOptions`, accumulateur streaming, trace des hints) mais les alimenter à partir du résultat du runtime (targets planifiés + hints agrégés) de façon à préserver les invariants `coverage=off` ⇒ aucune instrumentation et `coverage=measure` ⇒ flux d’instances identique à coverage=off; (3) remplacer le bloc post-Validate qui appelle `evaluateCoverage` et construit coverage-report/v1 par un appel à `evaluateCoverageAndBuildReport`, en passant explicitement les targets finalisés, les options coverage, les informations de run (seed, maxInstances, actualInstances, timestamps) et en vérifiant via les tests orchestrateur que `coverageMetrics` et `coverageReport` restent byte-identiques.

Risks/Unknowns:
- Toute divergence dans les artefacts coverage (graph, targets, metrics, report) entre l’implémentation inline actuelle et la version orchestrée via `coverage/runtime.ts` serait un écart par rapport à la spec et au contrat de 9331; il faudra surveiller particulièrement les cas coverage=off, coverage=measure et coverage=guided.
- Le refactor augmente le risque de cycles ou de couplage accidentel entre `pipeline/orchestrator.ts` et le module coverage; il faudra s’assurer que `coverage/runtime.ts` ne dépend que de types stables (options, Compose/Normalize, types coverage) et reste isolé des détails d’exécution du pipeline.
- Les tests orchestrateur et les snapshots coverage-report existants doivent rester valides sans mise à jour; si une différence apparaît, il faudra vérifier qu’elle ne vient pas d’un changement comportemental involontaire dans les options coverage (dimensionsEnabled, excludeUnreachable, minCoverage, reportMode).

DoD:
- [ ] `executePipeline` délègue la planification coverage (graph, targets, plannerCapsHit, unsatisfiedHints) à `planCoverageForPipeline` et la construction de coverage-report/v1 à `evaluateCoverageAndBuildReport`, avec un comportement observable inchangé pour coverage=off/measure/guided.
- [ ] Les tests orchestrateur (dont ceux autour de coverage, metrics et coverage-report) passent sans modifications de snapshots et démontrent que les artefacts coverage restent identiques à l’implémentation précédente.
- [ ] build/typecheck/lint/test/bench OK.

Parent bullets couverts: [KR3, DEL2]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
