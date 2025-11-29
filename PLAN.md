Task: 9306   Title: 9306.9306006 – Wire planner hints into pipeline orchestrator and add guided hints e2e tests
Anchors: [cov://§4#coverage-planner, cov://§5#hint-types, cov://§6#execution-modes-ux]
Touched files:
- packages/core/src/pipeline/orchestrator.ts
- packages/core/test/e2e/coverage-guided-planner.spec.ts
- .taskmaster/docs/9306-traceability.md
- PLAN.md

Approach:
Pour la sous-tâche 9306.9306006, je vais d’abord câbler la sortie du CoveragePlanner dans l’orchestrateur afin de produire une séquence déterministe de TestUnits avec `hints` et `seed` dérivés d’un masterSeed, puis propager ces informations jusqu’au générateur en mode `coverage=guided`. Concrètement, dans `executePipeline`, lorsque `coverage.mode='guided'` et que des `coverageTargets` existent, j’invoquerai `planTestUnits` puis `assignTestUnitSeeds` en utilisant le même seed que celui déjà passé à la génération, et j’agrégerai toutes les `hints` issues des TestUnits dans une structure passée au générateur via `FoundryGeneratorOptions.coverage.hints`, en respectant les invariants de déterminisme de la SPEC (pas de nouvelle source RNG, pas de perturbation du pattern d’appels existant).

Côté tests, je vais enrichir `coverage-guided-planner.spec.ts` pour couvrir un scénario end-to-end `executePipeline` sur un schéma `oneOf+enum`, exécuté en `coverage=measure` puis en `coverage=guided` avec les mêmes paramètres et en vérifiant que (a) les rapports de couverture montrent au moins autant de couverture sur les dimensions `branches` et `enum` en mode guided, (b) les rapports restent déterministes pour un tuple `(schema, options, seed)` fixé, y compris au niveau des `TestUnits` et de leurs `hints`, et (c) les runs `coverage=off` et `coverage=measure` restent inchangés (mêmes items finals, même comportement) malgré l’ajout des hints. Je veillerai à ne pas exposer ni tester l’ordonnancement exact des TestUnits au-delà des invariants spécifiés, de manière à garder les tests robustes vis-à-vis d’évolutions ultérieures du planner.

Risks/Unknowns:
Les principaux risques sont : (1) casser le déterminisme global du pipeline en introduisant une nouvelle consommation RNG ou en faisant dépendre les IDs/ordres de cibles de `dimensionsEnabled` ou d’autres options non prévues, (2) perturber le comportement de `coverage=off` ou `coverage=measure` en propageant des hints ou des TestUnits hors du mode guided, et (3) rendre les tests e2e trop sensibles à des détails d’implémentation (ordre exact des TestUnits, structure interne des diagnostics) au lieu de se concentrer sur les invariants observables définis dans la SPEC. Pour limiter ces risques, je vais m’aligner strictement sur les invariants de §4.2, §5 et §6 (planification statique à partir des CoverageTargets, derivation des seeds via `assignTestUnitSeeds`, hints consommés uniquement en guided), m’assurer que tout le câblage hints/TestUnits est encapsulé derrière les options `coverage` et ne s’active que lorsque `coverage.mode='guided'`, et écrire des assertions qui portent sur la couverture par dimension, la stabilité du rapport et la présence de `unsatisfiedHints`, sans sur-spécifier les détails de structure internes.

Parent bullets couverts: [KR1, KR2, KR3, DEL2, DOD1, DOD4, TS2, TS4]

SPEC-check: conforme aux anchors listés, aucun écart identifié ; cette sous-tâche se limite à câbler les hints du planner dans l’orchestrateur et à ajouter des tests e2e executePipeline démontrant l’effet de coverage=guided sur branches/enum, sans modifier le modèle de couverture ni le comportement des modes off/measure.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
