Task: 9306   Title: 9306.9306008 – Collect unsatisfied hints in pipeline and expose coverageReport.unsatisfiedHints
Anchors: [cov://§5#unsatisfied-hints-repair, cov://§6#execution-modes-ux, cov://§7#json-coverage-report]
Touched files:
- packages/core/src/pipeline/orchestrator.ts
- packages/core/src/pipeline/__tests__/pipeline-orchestrator.test.ts
- .taskmaster/docs/9306-traceability.md
- PLAN.md

Approach:
Pour la sous-tâche 9306.9306008, je vais étendre l’orchestrateur de pipeline pour collecter les `unsatisfiedHints` émis par le générateur (et, le cas échéant, par Repair) via le callback `recordUnsatisfiedHint`, les agréger au niveau du run et les exposer dans `artifacts.coverageReport.unsatisfiedHints`, en respectant le schéma de rapport JSON et le caractère strictement diagnostique de ces entrées. Concrètement, j’ajouterai un accumulateur local d’`UnsatisfiedHint` dans `executePipeline`, je ferai évoluer `CoverageHookOptions` pour inclure un champ optionnel `recordUnsatisfiedHint`, et je passerai, en mode `coverage=guided` uniquement, une implémentation qui pousse chaque hint dans le tableau agrégé, tout en continuant à n’activer la couverture (événements + planner) que lorsque `coverage.mode` n’est pas `off`.

Côté rapport, j’ajusterai la construction de `artifacts.coverageReport` pour recopier le tableau d’`unsatisfiedHints` agrégé, sans modifier le calcul des métriques (qui reste entièrement délégué à `evaluateCoverage`) ni la logique de `minCoverage` / `coverageStatus` / exit codes, afin de rester conforme à la SPEC (section rapport JSON et diagnostic-only). Pour les tests, j’enrichirai `coverage-guided-planner.spec.ts` avec un scénario `executePipeline` sur un schéma objet simple contenant plusieurs propriétés optionnelles et un `minProperties` strict, exécuté en `coverage=measure` puis `coverage=guided`, qui (a) vérifie que le rapport guided contient au moins une entrée `unsatisfiedHints` lorsque certains hints ne peuvent pas être honorés, (b) confirme que les métriques de couverture et la validité AJV restent intactes, et (c) garantit que `coverage=off` et `coverage=measure` restent inchangés (absence d’`unsatisfiedHints`, même comportement de génération).

Risks/Unknowns:
Les principaux risques sont : (1) introduire un couplage involontaire entre `unsatisfiedHints` et les métriques (par exemple en les faisant participer à `coverageStatus` ou aux seuils `minCoverage`), ce qui violerait le caractère diagnostique-only défini par la SPEC ; (2) casser le déterminisme global en ajoutant des effets de bord ou des structures mutables partagées entre runs ; (3) exposer des `unsatisfiedHints` dans des modes qui ne devraient pas en produire (`coverage=off` ou `coverage=measure`). Pour les atténuer, je garderai l’accumulateur d’`UnsatisfiedHint` strictement local à `executePipeline`, je ne l’alimenterai que via le callback guidé (aucun changement d’algorithme côté Evaluate), et j’ajouterai des assertions de tests e2e centrées sur la présence/contenu d’`unsatisfiedHints` dans le rapport sans modifier les checks existants sur les métriques et le statut du run.

Parent bullets couverts: [KR4, DOD3, DOD4, TS3]

SPEC-check: conforme aux anchors listés, aucun écart identifié ; cette sous-tâche se limite à agréger les unsatisfiedHints émis par les phases Generate/Repair et à les exposer dans le CoverageReport v1 comme diagnostics, sans changer le calcul ni l’interprétation des métriques de couverture ou des seuils.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
