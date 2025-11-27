Task: 9301   Title: Wire CoverageAnalyzer inputs from Compose
Anchors: [cov://§4#architecture-components, cov://§4#coverage-analyzer, spec://§8#coverage-index-export, spec://§0#terminology]
Touched files:
- packages/shared/src/coverage/index.ts
- packages/core/src/coverage/index.ts
- packages/core/src/coverage/analyzer.ts
- packages/core/src/pipeline/types.ts
- packages/core/src/pipeline/orchestrator.ts
- packages/core/src/pipeline/__tests__/pipeline-orchestrator.test.ts

Approach:
Pour cette sous-tâche, je vais introduire un point d’entrée CoverageAnalyzer minimal dans le package core, aligné avec le rôle défini dans l’architecture coverage-aware (cov://§4#architecture-components, cov://§4#coverage-analyzer). Ce point d’entrée acceptera explicitement la vue canonique du schéma (`canonSchema` et `ptrMap` issus de Normalize, spec://§0#terminology), ainsi que les artefacts coverage-aware produits par Compose (`coverageIndex` et `planDiag`, spec://§8#coverage-index-export). Dans `PipelineOptions`, j’ajouterai une enveloppe de configuration coverage avec un `coverageMode` typé, tout en le faisant par défaut à 'off' pour respecter le gating strict coverage=off et ne pas impacter les appels existants. Dans l’orchestrateur, je câblerai `executePipeline` pour calculer les options coverage, puis appeler CoverageAnalyzer uniquement lorsque `coverageMode` vaut 'measure' ou 'guided', en construisant un objet d’entrée garanti à partir de `normalizeResult` et `composeResult`, et en stockant le graphe et les targets retournés dans `artifacts` pour les tâches ultérieures (Planner, Evaluator). Le CoverageAnalyzer lui-même restera déterministe et purement fonctionnel, avec une implémentation initiale neutre (graph/targets vides) pour ne pas modifier les comportements de génération tant que la logique d’analyse n’est pas implémentée. Enfin, j’étendrai les tests du pipeline pour couvrir les cas `coverageMode='off'` (aucun artefact coverage produit) et `coverageMode='measure'` (artifacts coverage présents), en gardant la timeline et les métriques inchangées.

Risks/Unknowns:
- Définition exacte de l’API publique du CoverageAnalyzer (types d’entrée/sortie) sans sur-spécifier des champs qui devront être affinés dans les sous-tâches suivantes (construction du CoverageGraph, targets par dimension).
- Positionnement futur de CoverageAnalyzer comme “stage” explicite dans la timeline, alors qu’il est initialement implémenté comme étape interne post-Compose dans cette sous-tâche.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true

