Task: 9303   Title: Add snapshot tests for coverage-report/v1 JSON (subtask 9303.9303005)
Anchors: [cov://§3#coverage-model, cov://§4#coverage-evaluator, cov://§7#json-coverage-report]
Touched files:
- packages/core/src/coverage/__tests__/evaluator.test.ts
- packages/core/src/coverage/__tests__/coverage-report-json.test.ts

Approach:
Pour cette sous-tâche 9303.9303005, je vais ajouter des tests de snapshot qui valident la stabilité de la structure JSON et des valeurs clés du coverage-report/v1 produit par le pipeline, en particulier `metrics`, `dimensionsEnabled` et `metrics.targetsByStatus`. Je partirai des tests existants de `evaluateCoverage` dans `packages/core/src/coverage/__tests__/evaluator.test.ts` pour construire des scénarios représentatifs (dimensions multiples, `excludeUnreachable` vrai/faux, cibles `deprecated` de type SCHEMA_REUSED_COVERED) et j'ajouterai des assertions supplémentaires sur `metrics.targetsByStatus` et la cohérence entre `uncoveredTargets` et ces compteurs, conformément aux exigences de la tâche parente (DOD2, DOD5). En complément, je créerai un fichier de test dédié `coverage-report-json.test.ts` dans le même dossier, qui appellera la pipeline (ou un helper proche de la production du rapport) sur un petit ensemble de schémas de démonstration et fixera des snapshots JSON pour l'en-tête (version, reportMode, engine, run) et les structures `targets` / `uncoveredTargets`, en respectant les invariants `dimensionsEnabled` et `excludeUnreachable` (cov://§3#coverage-model, cov://§4#coverage-evaluator, cov://§7#json-coverage-report).

Ces snapshots seront conçus pour être robustes face aux évolutions non significatives (par exemple en normalisant les timestamps ou en les remplaçant par des valeurs stables dans les fixtures) afin de garantir une détection fine des régressions de structure sans rendre les tests fragiles. Je m'assurerai que les tests couvrent à la fois `reportMode:'full'` et `reportMode:'summary'` au niveau du JSON final, et qu'ils vérifient l'absence d'effets indésirables de `dimensionsEnabled` sur les IDs de cibles (projection uniquement). Les snapshots et assertions explicites sur `metrics.targetsByStatus` permettront de marquer comme couverts les bullets parent [DOD2], [DOD5] et [TS5] dans la table de traçabilité, en documentant clairement le lien entre les fixtures, les dimensions actives et les compteurs par statut.

Risks/Unknowns:
Les principaux risques sont de rendre les snapshots trop fragiles vis-à-vis de détails non normatifs (timestamps, champs annexes destinés au debug) ou de figer des valeurs liées à l'aléa contrôlé (seed de RNG) au lieu de se concentrer sur la structure et les invariants métier. Il faudra aussi veiller à ne pas violer les invariants de gating coverage=off (aucun rapport produit dans ce mode) ni ceux de `dimensionsEnabled` et `excludeUnreachable` (projection uniquement, dénominateurs modifiés sans changer les IDs ni les statuts). Enfin, si la production du JSON passe par plusieurs couches (CoverageEvaluator, orchestrateur, API), il faudra choisir des points d'accroche de tests qui restent suffisamment proches de la production réelle sans dupliquer des tests déjà couverts par d'autres sous-tâches.

Parent bullets couverts: [DOD2, DOD5, TS5]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
