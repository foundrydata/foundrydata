Task: 9310   Title: Implement OP_REQUEST_COVERED, OP_RESPONSE_COVERED and SCHEMA_REUSED_COVERED targets
Anchors: [cov://§3#coverage-model, spec://§7#pass-order]
Touched files:
- packages/core/src/coverage/coverage-analyzer-openapi.ts
- packages/core/src/coverage/analyzer.ts
- packages/core/src/coverage/__tests__/coverage-analyzer-openapi.spec.ts
- packages/core/src/coverage/__tests__/evaluator.test.ts
- .taskmaster/docs/9310-traceability.md

Approach:
Pour 9310.9310002, je vais étendre la couche OpenAPI du CoverageAnalyzer pour matérialiser des cibles au niveau de la dimension `operations` (cov://§3#coverage-model) sans modifier le comportement des dimensions existantes. Dans `coverage-analyzer-openapi.ts`, j’ajouterai la création de cibles `OP_REQUEST_COVERED` et `OP_RESPONSE_COVERED` par `operationKey`, en ne les matérialisant que lorsque la dimension `operations` est présente dans `dimensionsEnabled` et en prenant comme `canonPath` le pointeur canonique de l’opération, de façon à préparer le calcul futur de `coverage.byOperation` sans encore mapper les cibles de structure/branches/enum. J’y détecterai également les schémas canoniques réutilisés par plusieurs opérations (par exemple via `$ref` vers `#/components/schemas/...`) pour émettre des cibles `SCHEMA_REUSED_COVERED` strictement diagnostiques (dimension `operations`, statut `deprecated`) visibles dans `targets`/`uncoveredTargets` mais exclues des métriques, en m’appuyant sur la génération d’identifiants stable existante (spec://§7#pass-order). Dans `analyzer.ts`, je passerai au helper OpenAPI l’état `targets` et le contexte d’ID pour qu’il puisse enrichir le `CoverageGraph` et la liste de cibles de manière purement fonctionnelle, et dans `coverage-analyzer-openapi.spec.ts` j’ajouterai des tests qui vérifient: (a) que les cibles `operations` ne sont matérialisées que si la dimension est activée, (b) que `SCHEMA_REUSED_COVERED` apparaît pour des schémas partagés avec `status:'deprecated'`, et (c) que le graphe et l’ensemble de cibles restent déterministes. Enfin, je compléterai `evaluator.test.ts` si nécessaire pour confirmer que ces cibles diagnostiques ne modifient ni `metrics.overall` ni `metrics.byDimension`/`byOperation`.

Risks/Unknowns:
- La détection de réutilisation de schéma doit rester alignée sur la vue canonique sans réimplémenter Compose; je me limiterai à des heuristiques basées sur les pointeurs canoniques et/ou les `$ref` OpenAPI vers `#/components/schemas/...`, en laissant les raffinements éventuels aux sous-tâches ultérieures si la SPEC l’exige.
- Il faudra veiller à ce que l’ajout de cibles `operations` n’affecte pas les IDs ou l’ordre des cibles existantes, ni le comportement de `evaluateCoverage` pour les autres dimensions; les tests devront comparer des runs avec et sans dimension `operations` activée.
- Les tests ne doivent pas empiéter sur le mapping complet `coverage.byOperation` (9310.9310003) ni sur les scénarios CLI; je resterai sur des tests unitaires de l’analyzer et de l’evaluator, centrés sur la présence/absence de cibles et sur le caractère purement diagnostique de `SCHEMA_REUSED_COVERED`.

Parent bullets couverts: [KR2, KR3, KR4, DEL1, DEL2, DOD2, DOD3, TS1, TS2, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
