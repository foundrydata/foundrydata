Task: 9305   Title: 9305.9305005 – Add integration tests for coverage=guided planning behavior
Anchors: [cov://§3#coverage-model, cov://§4#coverage-planner, cov://§6#execution-modes-ux]
Touched files:
- packages/core/src/coverage/index.ts
- packages/core/src/coverage/coverage-planner.ts
- packages/core/test/e2e/coverage-guided-planner.spec.ts
- .taskmaster/docs/9305-traceability.md
- PLAN.md

Approach:
Pour la sous-tâche 9305.9305005, je vais ajouter des tests d’intégration qui exercent le pipeline complet en `coverage=guided` sur de petits schémas d’acceptance (oneOf + enum), afin de vérifier que le planner statique (cibles + caps + seeds) permet effectivement d’atteindre tous les branches et valeurs d’enum quand le budget maxInstances est suffisant. Concrètement, je vais introduire un nouveau fichier `packages/core/test/e2e/coverage-guided-planner.spec.ts` qui invoque l’API Node/pipeline avec un schéma synthétique partagé entre un run `coverage=measure` (baseline) et un run `coverage=guided`, avec les mêmes valeurs de `maxInstances` et de `seed/masterSeed`. Les assertions compareront `coverage.metrics.byDimension` pour `branches` et `enum`, en vérifiant que le mode guided atteint au moins autant (et idéalement 1.0 sur ces dimensions pour le schéma choisi) que le mode measure.

Ces tests resteront focalisés sur le comportement observable du rapport de couverture (targets et metrics), sans modifier l’orchestrateur ni les structures internes du planner. Si nécessaire, j’utiliserai les helpers existants (par ex. `executePipeline` et les fixtures de schémas simples) pour isoler des cas où les stratégies heuristiques seules n’atteignent pas toutes les branches/enum sous un budget donné, tandis que la combinaison Analyzer + Planner + seeds améliorera la couverture dans le run guided. Je veillerai aussi à garder les tests déterministes (seeds fixés, masterSeed stable) et à ne pas introduire de dépendance fragile à des détails de mise en œuvre non spécifiés (comme l’ordre exact des TestUnits), en me limitant aux métriques de couverture et au statut des targets.

Risks/Unknowns:
Le principal risque est de rendre les tests trop étroitement couplés à des détails de scoring ou d’heuristiques non normatifs, ce qui pourrait les rendre fragiles face à de futures optimisations de planner ou de generator. Je vais donc choisir des schémas très simples où la correspondance entre cibles (branches/enums) et instances est triviale, et où l’on peut atteindre une couverture complète sans dépendre de heuristiques fines. Autre point d’attention : vérifier que le mode guided ne viole pas les invariants déterministes (mêmes inputs ⇒ même rapport) et qu’il ne détériore pas la couverture sur d’autres dimensions; les tests se concentreront toutefois uniquement sur branches/enum, conformément au scope de M1.

Parent bullets couverts: [KR1, KR2, KR6, DOD1, DOD4, TS3]

SPEC-check: conforme aux anchors listés, pas d’écart identifié ; cette sous-tâche se limite à documenter par des tests d’intégration les gains de couverture du mode guided sur branches/enum, en réutilisant le pipeline existant, sans étendre la sémantique de coverage ni toucher aux autres phases du pipeline.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
