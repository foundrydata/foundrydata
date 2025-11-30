Task: 9310   Title: Build OperationNode mapping and operationKey derivation
Anchors: [cov://§3#coverage-model, spec://§7#pass-order]
Touched files:
- packages/core/src/coverage/coverage-analyzer-openapi.ts
- packages/core/src/coverage/analyzer.ts
- packages/core/src/coverage/__tests__/coverage-analyzer-openapi.spec.ts
- .taskmaster/docs/9310-traceability.md

Approach:
Pour 9310.9310001, je vais introduire une couche OpenAPI dans le CoverageAnalyzer qui construit explicitement des `OperationNode` à partir de la vue canonique et de la description OpenAPI, en respectant la définition du CoverageGraph et des clés d’opération (cov://§3#coverage-model). Concrètement, je créerai un module dédié `coverage-analyzer-openapi.ts` qui expose une petite API pure (par exemple `buildOperationNodes`) prenant la structure OpenAPI normalisée et la carte canonique, et produisant des nœuds et arêtes `kind:'operation'` reliant chaque opération aux schémas de requêtes et de réponses JSON retenus. L’algorithme de dérivation `operationKey` s’alignera sur la règle `operationId || "<METHOD> <path>"` décrite dans la SPEC, avec une normalisation minimale de la méthode, sans réimplémenter la sémantique de sélection de schéma déjà couverte côté canonique / OpenAPI driver (spec://§7#pass-order). Dans `analyzer.ts`, j’intègrerai cette logique en enrichissant le `CoverageGraphBuildState` pour accepter aussi les nœuds d’opération, tout en garantissant que la génération actuelle de cibles de structure/branches/enum/boundaries reste inchangée (pas de nouveaux CoverageTarget ni de champs `operationKey` à ce stade). Enfin, j’ajouterai un fichier de tests unitaires `coverage-analyzer-openapi.spec.ts` qui construit des mini-documents OpenAPI avec plusieurs chemins et opérations, vérifie que les `OperationNode` créés sont déterministes, que les `operationKey` attendus sont produits (avec et sans `operationId`) et que le graphe reste stable pour un même document.

Risks/Unknowns:
- Il faut clarifier comment la couche OpenAPI accède à la vue canonique sans introduire de dépendances circulaires ni d’API implicites; je limiterai cette sous-tâche à la construction du graphe d’opérations en laissant la matérialisation des cibles OP_* et des métriques byOperation aux sous-tâches suivantes.
- La granularité des `OperationNode` (un par opération globale vs un par combinaison `(request|response, status, contentType)`) doit rester compatible avec la SPEC tout en gardant le graphe lisible; je choisirai une représentation simple (un nœud par operationKey et arêtes vers les schémas pertinents) et ajusterai au besoin dans les sous-tâches de mapping et de métriques.
- Les tests unitaires devront rester assez ciblés pour ne pas préfigurer le comportement de `coverage.byOperation` ou des cibles SCHEMA_REUSED_COVERED, afin de préserver le périmètre de 9310.9310002–9310.9310004 et éviter les couplages fragiles.

Parent bullets couverts: [KR1, DEL1, DOD1, TS1]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
