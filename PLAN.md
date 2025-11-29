Task: 9306   Title: 9306.9306005 – Add end-to-end tests for guided hints on schemas with oneOf and enums
Anchors: [cov://§3#coverage-model, cov://§5#hint-types, cov://§6#execution-modes-ux]
Touched files:
- packages/core/src/generator/__tests__/generator-hints.spec.ts
- .taskmaster/docs/9306-traceability.md
- PLAN.md

Approach:
Pour la sous-tâche 9306.9306005, je vais compléter les tests de `generator-hints.spec.ts` pour couvrir des scénarios “quasi end-to-end” sur des schémas combinant `oneOf` et `enum`, en vérifiant que, pour un tuple fixé `(schema, hints, coverage=guided, seed)`, les instances générées reflètent bien les hints et restent stables d’un run à l’autre. Concrètement, je m’appuie sur un schéma où la racine est un `oneOf` de deux objets chacun muni d’un champ enum, et j’injecte un paquet de hints couvrant toutes les branches et toutes les valeurs d’énum pour chaque branche, puis j’asserte que les instances produites couvrent effectivement ces combinaisons (kinds et tags) et que la même configuration de hints donne des résultats identiques sur plusieurs exécutions.

Ces tests restent focalisés sur le générateur (via `generateFromCompose`) plutôt que sur l’orchestrateur complet, ce qui permet de rester dans le périmètre actuel de M1 tout en documentant le comportement observable des hints sur des schémas de type `oneOf+enum`. Les assertions portent sur : (1) l’effet des hints de branches et d’énums sur les instances générées, (2) la stabilité des décisions pour un seed donné, et (3) la compatibilité avec les tests existants de `coverage-guided-planner.spec.ts` qui valident déjà que la couverture=guided ne dégrade pas la couverture branches/enum par rapport à coverage=measure.

Risks/Unknowns:
Les principaux risques sont : (1) introduire des tests e2e trop dépendants de détails internes du planner ou du générateur (ordre exact des TestUnits, formalisme des diagnostics) et donc fragiles à de futures optimisations, (2) étendre le scope en modifiant le câblage production des hints dans l’orchestrateur alors que la sous-tâche porte uniquement sur des tests, et (3) dégrader les garanties de déterminisme en mélangeant plusieurs sources de RNG ou en s’appuyant sur l’ordre d’énumération de structures non spécifiées. Pour les limiter, je vais m’appuyer sur des schémas et budgets très simples, utiliser des Stage overrides uniquement dans les tests pour injecter des hints connus, et ne faire porter les assertions que sur des invariants clairement spécifiés (niveau de couverture branches/enum, présence d’unsatisfiedHints, stabilité des rapports pour un tuple `(schema, options, seed)` donné).

Parent bullets couverts: [KR1, KR2, KR3, DOD1, DOD4, TS4]

SPEC-check: conforme aux anchors listés, aucun écart identifié ; cette sous-tâche se limite à ajouter des tests de bout en bout démontrant l’effet des hints en mode guided sur branches/enum et la présence d’unsatisfiedHints lorsqu’un hint est impossible, en réutilisant les hooks existants sans modifier la sémantique de coverage.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
