Task: 9303   Title: Define CoverageReport types and thresholds structure (subtask 9303.9303001)
Anchors: [cov://§7#json-coverage-report, cov://§7#thresholds-mincoverage]
Touched files:
- packages/shared/src/types/coverage-report.ts
- packages/shared/src/index.ts
- packages/shared/src/coverage/__tests__/coverage-report-types.test.ts

Approach:
Pour cette sous-tâche 9303.9303001, je vais introduire les types partagés nécessaires pour le rapport `coverage-report/v1` décrits dans la SPEC coverage-aware (§7.1, cov://§7#json-coverage-report) et la structure des seuils (§7.3, cov://§7#thresholds-mincoverage). Je vais créer un module `packages/shared/src/types/coverage-report.ts` qui définit les types `PlannerCapHit`, `UnsatisfiedHintReasonCode`, `UnsatisfiedHint` et `CoverageReport`, en s’appuyant sur les types de base déjà exposés par `packages/shared/src/coverage/index.ts` (dimensions, statuts) plutôt que de dupliquer ces définitions. Les champs optionnels (`operationsScope`, `selectedOperations`, `metrics.thresholds`) seront modélisés comme dans la SPEC, en veillant à ce que `thresholds.byDimension` et `thresholds.byOperation` existent comme hooks descriptifs mais sans implication comportementale en V1. J’actualiserai `packages/shared/src/index.ts` pour réexporter ce module et ajouterai un test de types dans `packages/shared/src/coverage/__tests__/coverage-report-types.test.ts` qui vérifie la forme attendue de `CoverageReport`, ainsi que la contrainte sur `coverageMode`, `dimensionsEnabled`, `targetsByStatus` et `metrics.thresholds`. L’objectif est de fournir un contrat de type unique et stable pour les futures tâches (CoverageEvaluator, Node API, reporter) sans toucher au pipeline ni à la logique d’agrégation à ce stade.

Risks/Unknowns:
Le principal risque est de figer des noms de champs ou des unions trop larges ou trop étroites par rapport à la SPEC, ce qui compliquerait l’évolution future du format `coverage-report/v1`. Je limiterai les commentaires aux garanties explicitement données par la SPEC et m’assurerai que les types restent forward‑compatibles (par exemple en utilisant `Record<string, number>` là où la SPEC laisse la porte ouverte à de nouvelles dimensions ou opérations). Un autre point de vigilance est l’emplacement du module (`types` vs `coverage`), que je documenterai clairement via les exports pour éviter les import paths multiples.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
