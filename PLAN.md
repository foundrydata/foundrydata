Task: 9301   Title: Implement graph construction for schema, property and branch nodes
Anchors: [cov://§3#coverage-model, cov://§4#coverage-analyzer, spec://§8#composition-engine, spec://§0#terminology]
Touched files:
- packages/shared/src/coverage/index.ts
- packages/core/src/coverage/index.ts
- packages/core/src/coverage/analyzer.ts
- packages/core/src/pipeline/types.ts
- packages/core/src/pipeline/orchestrator.ts
- packages/core/src/pipeline/__tests__/pipeline-orchestrator.test.ts

Approach:
Pour cette sous-tâche, je vais implémenter dans `CoverageAnalyzer` la construction effective du `CoverageGraph` pour les nœuds de type schéma, propriété et branche, en respectant le modèle coverage-aware (cov://§3#coverage-model) et l’architecture CoverageAnalyzer (cov://§4#coverage-analyzer). À partir de la vue canonique (`canonSchema`) et de `ptrMap` (spec://§0#terminology), j’ajouterai un petit visiteur déterministe qui parcourt les sous-schémas via des pointeurs canoniques construits comme dans le CompositionEngine (spec://§8#composition-engine), sans reparser le schéma brut. Chaque pointeur de schéma donnera lieu à un `CoverageGraphNode` dont l’`id` est dérivé de la JSON Pointer canonique : par défaut `kind:'schema'`, avec une spécialisation `kind:'property'` pour les chemins `/properties/<name>` (meta incluant le nom de propriété), et `kind:'branch'` pour les branches `oneOf`/`anyOf` et les blocs conditionnels (`if`/`then`/`else`). Pour chaque relation parent→enfant au niveau du schéma canonique, j’ajouterai une arête `structural` (`schema → property`, `schema → branch`) dans le graphe, en veillant à éviter les doublons grâce à des tables d’index internes. L’API `CoverageAnalyzerInput` restera inchangée et continuera d’accepter `coverageIndex` et `planDiag` sans encore les exploiter pour les cibles, afin de ne pas anticiper sur les sous-tâches suivantes. Côté pipeline, je conserverai le gating actuel (`coverage.mode` à 'off' par défaut, aucun graphe construit dans ce cas) et j’ajusterai les tests orchestrateur pour vérifier qu’en mode `measure` un graphe cohérent est produit (nœud racine, nœuds de propriété et de branche attendus) tout en gardant la timeline des étapes inchangée.

Risks/Unknowns:
- Découpage exact entre nœuds `schema` et `property`/`branch` (par exemple pour les branches conditionnelles et les schémas imbriqués) pour rester fidèle à la SPEC tout en gardant le graphe simple à consommer dans les tâches suivantes.
- Prise en compte future d’autres nœuds (enum, contraintes, opérations) sans casser le format du graphe ou les invariants de déterminisme établis dans cette première implémentation.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
