Task: 9303   Title: Implement CoverageEvaluator metrics aggregation (subtask 9303.9303002)
Anchors: [cov://§3#coverage-model, cov://§4#coverage-evaluator, cov://§7#json-coverage-report, cov://§7#thresholds-mincoverage]
Touched files:
- packages/core/src/coverage/evaluator.ts
- packages/core/src/coverage/__tests__/evaluator.test.ts

Approach:
Pour cette sous-tâche 9303.9303002, je vais implémenter un module `CoverageEvaluator` dédié au calcul des métriques à partir des `CoverageTargetReport` produits par l’Analyzer et l’accumulateur. En m’appuyant sur la SPEC coverage-aware (§3.5, cov://§3#coverage-model) et la section dédiée au CoverageEvaluator (§4.4, cov://§4#coverage-evaluator), je définirai une fonction pure qui prend en entrée la liste complète des cibles (avec `hit`), la configuration `dimensionsEnabled` et le flag `excludeUnreachable`, et retourne les composantes suivantes : `metrics.overall`, `metrics.byDimension`, `metrics.byOperation`, `metrics.targetsByStatus`, `metrics.thresholds` et `uncoveredTargets`. Les ratios seront calculés selon la définition `activeTargetsHit / activeTargetsTotal`, en excluant systématiquement les cibles `status:'deprecated'` (notamment `SCHEMA_REUSED_COVERED`, cov://§3#coverage-model) des dénominateurs et en appliquant `excludeUnreachable` uniquement sur l’inclusion des cibles `status:'unreachable'` dans ces dénominateurs, jamais sur les IDs ou les statuts eux‑mêmes. Pour `coverage.byOperation`, j’utiliserai la projection par `operationKey` décrite dans le modèle de couverture, en calculant des ratios indépendants pour chaque opération lorsque des cibles sont annotées avec un `operationKey`. La structure des `CoverageMetrics` et de `CoverageReport` restera alignée avec la définition du rapport JSON (§7.1, cov://§7#json-coverage-report) et des seuils globaux (§7.3, cov://§7#thresholds-mincoverage), mais je limiterai cette sous-tâche à la mise à disposition des champs `thresholds` et au calcul brut des métriques, sans encore brancher l’évaluateur dans le pipeline ni implémenter les comportements spécifiques à `reportMode` ou aux sorties CLI/Node (couverts par les sous-tâches suivantes).

Risks/Unknowns:
Les principaux risques sont de mal interpréter les règles de dénominateur (en particulier l’effet de `excludeUnreachable` et des cibles `status:'deprecated'`) ou de faire dépendre les IDs / statuts de `dimensionsEnabled` ou d’une heuristique de filtrage non prévue par la SPEC. Pour limiter ce risque, je structurerai l’algorithme autour d’un filtrage explicite des cibles “éligibles aux métriques” (dimensions actives, statut non déprécié) et j’ajouterai des tests unitaires qui couvrent les cas suivants : mélange de cibles `active` / `unreachable` avec `excludeUnreachable` à `true`/`false`, présence de cibles `SCHEMA_REUSED_COVERED` qui ne doivent jamais modifier les ratios, et opérations avec ou sans cibles associées pour vérifier que `coverage.byOperation` reste vide lorsque rien n’est mappé par `operationKey`. Un autre point d’attention est de ne pas anticiper le comportement de `reportMode` ou l’intégration pipeline/CLI, qui feront l’objet de sous-tâches dédiées ; je limiterai donc cette implémentation à un noyau pur et déterministe, facilement appelable depuis ces couches.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
