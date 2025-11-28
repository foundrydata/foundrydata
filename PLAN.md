Task: 9303   Title: Wire CoverageEvaluator into pipeline result and Node API (subtask 9303.9303004)
Anchors: [cov://§3#coverage-model, cov://§4#coverage-evaluator, cov://§7#json-coverage-report]
Touched files:
- packages/core/src/pipeline/orchestrator.ts
- packages/core/src/api.ts
- packages/core/src/pipeline/__tests__/pipeline-orchestrator.test.ts

Approach:
Pour cette sous-tâche 9303.9303004, je vais raccorder lévaluateur de couverture et le format de rapport JSON au pipeline existant sans modifier le comportement de génération. Côté orchestrateur (`executePipeline`), je brancherai lappel à `evaluateCoverage` en fin de pipeline lorsque `coverage.mode` est `measure` ou `guided`, en lui passant la liste complète des cibles instrumentées (`artifacts.coverageTargets`), les options `dimensionsEnabled` / `excludeUnreachable` et, le cas échéant, un seuil global issu des options (préparant la logique `thresholds.overall` décrite dans cov://§7#json-coverage-report). Jutiliserai ensuite `applyReportModeToCoverageTargets` (cov://§4#coverage-evaluator, cov://§7#json-coverage-report) pour transformer les tableaux `targets` et `uncoveredTargets` en fonction de `reportMode`, tout en conservant des métriques calculées sur lunivers complet de cibles (cov://§3#coverage-model). Le rapport complet `CoverageReport` restera un artefact du pipeline (`artifacts.coverageReport` ou équivalent) afin de ne pas coupler prématurément le cœur de pipeline avec la forme exacte de lAPI haut niveau.

Côté API Node (`Generate` dans `api.ts`), je conserverai la structure actuelle de litérable dinstances et jajouterai un champ facultatif `coverage: Promise<CoverageReport>` sur le résultat, aligné sur la forme indicative du Node API dans la SPEC (cov://§7#json-coverage-report). Ce `coverage` sera dérivé du `PipelineResult` renvoyé par `executePipeline` en lisant lartefact de rapport, sans réexécuter le pipeline ni recalculer de métriques. Les tests dintégration dans `pipeline-orchestrator.test.ts` vérifieront que le pipeline renseigne bien lartefact coverage quand `coverage.mode` est actif (et ne le fait pas quand `coverage=off`), que les métriques du rapport restent cohérentes avec celles de `evaluateCoverage`, et que `Generate` expose un `coverage` Promise résolue avec un rapport JSON typé `coverage-report/v1`.

Risks/Unknowns:
Les principaux risques sont de mélanger la logique de gating coverage=off (aucun Analyzer/Evaluator ni instrumentation, cov://§3#coverage-model) avec lexposition du rapport, ou de rendre `executePipeline` dépendant de détails de lAPI Node/CLI (à éviter pour garder des responsabilités claires par phase, cov://§4#coverage-evaluator). Je devrai également veiller à ce que `coverage=measure`/`guided` ninfluence pas le flux dinstances par rapport à `coverage=off` (cov://§3#coverage-model) et à ce que les métriques reportées restent calculées sur lunivers complet de cibles indépendamment de `reportMode` (cov://§7#json-coverage-report). Enfin, lajout du champ `coverage` dans lAPI Node nécessitera de garder la compatibilité des usages existants en marquant ce champ comme optionnel et en documentant son usage.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true

