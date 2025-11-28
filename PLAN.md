Task: 9305   Title: 9305.9305003 – Implement planner caps and diagnostics
Anchors: [cov://§4#coverage-planner, cov://§6#execution-modes-ux, cov://§6#budget-profiles]
Touched files:
- packages/core/src/coverage/index.ts
- packages/core/src/coverage/coverage-planner.ts
- packages/core/src/coverage/coverage-planner-caps.ts
- packages/core/src/pipeline/types.ts
- .taskmaster/docs/9305-traceability.md
- PLAN.md

Approach:
Pour la sous-tâche 9305.9305003, je vais enrichir le planner existant avec une couche de caps déterministes par dimension/schema/operation, sans modifier encore l’orchestrateur ni la dérivation des seeds. Concrètement, j’introduirai un module dédié (`coverage-planner-caps.ts`) qui, à partir de la liste de targets ordonnée (comme dans `planTestUnits`) et d’un `CoveragePlannerConfig`, calcule pour chaque tuple `(dimension, scopeType, scopeKey)` un budget maximal de cibles planifiables (en s’appuyant sur `CoveragePlannerCapsConfig` et des valeurs par défaut raisonnables pour V1). Ce module renverra un ensemble de cibles effectivement planifiées et des structures `PlannerCapHit` synthétiques qui capturent, pour chaque scope affecté, `totalTargets`, `plannedTargets` et `unplannedTargets`.

Sur la base de ces décisions, j’ajouterai un utilitaire qui met à jour les `CoverageTarget` en marquant `meta.planned:false` pour toutes les cibles non sélectionnées par le planner lorsque des caps sont atteints, tout en laissant les cibles hors caps inchangées. Les diagnostics de caps seront exposés sous une forme prête à être consommée par le CoverageEvaluator/rapport (`plannerCapsHit`), mais sans câbler encore cette intégration dans le pipeline (respect du scope de la sous-tâche). Côté tests, je créerai des scénarios unitaires avec des `CoverageTarget` synthétiques couvrant plusieurs dimensions et opérations, en vérifiant que : (1) les caps sont appliqués de façon déterministe, (2) les cibles non planifiées reçoivent bien `meta.planned:false`, et (3) les entrées `PlannerCapHit` reflètent correctement les décomptes total/planned/unplanned pour chaque scope.

Risks/Unknowns:
Le principal risque est de choisir une stratégie de caps trop complexe ou trop implicite, difficile à expliquer dans les diagnostics et à stabiliser d’un run à l’autre. Je vais rester sur un modèle simple (par exemple des plafonds par dimension et par scope avec un ordre de priorité clair) et m’assurer que les caps n’affectent jamais le statut ou l’ID des cibles, uniquement leur planification (via `meta.planned:false` et `plannerCapsHit`). Un autre point d’attention est de ne pas surcharger cette sous-tâche avec l’intégration complète dans le CoverageReport; je me limiterai à produire des structures de diagnostics et des mutations de `CoverageTarget.meta` prêtes à être consommées, en laissant le câblage final au niveau du pipeline et du reporter aux tâches dédiées.

Parent bullets couverts: [KR3, KR4, KR5, DEL2, DOD3, TS4]

SPEC-check: conforme aux anchors listés, pas d’écart identifié ; cette sous-tâche se concentre sur la matérialisation des caps déterministes et des diagnostics associés (`meta.planned:false`, structures `plannerCapsHit`), sans modifier l’orchestrateur ni la génération des seeds, ni la logique de calcul des métriques de couverture qui restent sous la responsabilité des tâches 9303 et des sous-tâches ultérieures de 9305.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
