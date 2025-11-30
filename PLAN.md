Task: 9310   Title: Add tests and fixtures for OpenAPI coverage behavior
Anchors: [cov://§3#coverage-model, cov://§7#cli-summary, spec://§7#pass-order]
Touched files:
- packages/core/src/coverage/coverage-analyzer-openapi.ts
- packages/core/src/coverage/analyzer.ts
- packages/core/src/coverage/__tests__/coverage-analyzer-openapi.spec.ts
- packages/core/src/coverage/__tests__/evaluator.test.ts
- .taskmaster/docs/9310-traceability.md

Approach:
Pour 9310.9310004, je vais me concentrer sur les fixtures et tests qui valident le comportement de bout en bout de la couverture OpenAPI, sans ajouter de nouvelles fonctionnalités côté runtime. Côté core, je compléterai les tests existants dans `coverage-analyzer-openapi.spec.ts` et `evaluator.test.ts` en introduisant un ou deux petits documents OpenAPI synthétiques (plusieurs opérations, schémas partagés) utilisés pour vérifier simultanément: (a) la forme des `operationKey`, (b) l’apparition des cibles `OP_REQUEST_COVERED`/`OP_RESPONSE_COVERED` et `SCHEMA_REUSED_COVERED`, (c) la projection `coverage.byOperation` lorsque la dimension `operations` est activée ou non, et (d) la stabilité des IDs et métriques globales (cov://§3#coverage-model, spec://§7#pass-order). Côté CLI, j’ajouterai un test d’intégration dans `packages/cli/src/index.test.ts` qui appelle la commande `openapi` sur une fixture JSON stockée sous `packages/cli/src/__tests__/fixtures/` (ou réutilise une fixture légère existante), avec `coverage=measure` et `coverage-dimensions` incluant `'operations'`, en demandant un rapport JSON: le test vérifiera que le rapport contient `run.operationsScope` et `run.selectedOperations` attendus, que `metrics.byOperation` expose les ratios corrects par opération et que le résumé CLI (`cov://§7#cli-summary`) fait apparaître les opérations les moins couvertes dans un ordre déterministe. Je compléterai éventuellement avec un second test qui exécute la même fixture sans la dimension `operations` pour prouver que les IDs, `coverage.overall` et la structure du résumé restent cohérents.

Risks/Unknowns:
- Il faudra veiller à ce que les nouveaux tests CLI ne deviennent pas fragiles vis-à-vis du formatage du résumé texte (ordre, arrondis); je ciblerai plutôt la structure JSON du rapport et des messages clés (présence d’entries dans `byOperation`, ordre déterministe des opérations, etc.) en restant tolérant sur les détails de présentation.
- Les fixtures OpenAPI doivent rester petites pour que les tests restent rapides et déterministes; je privilégierai des schémas minimaux tout en couvrant les cas critiques (opérations avec et sans `operationId`, schémas partagés, dimension `operations` activée/désactivée).
- Je m’assurerai que les tests n’empiètent pas sur d’autres tâches (ex. modification des flags CLI ou des profils coverage) et restent strictement centrés sur les comportements décrits par 9310 (métriques par opération, SCHEMA_REUSED_COVERED, résumé CLI).

Parent bullets couverts: [DEL3, DOD1, DOD2, DOD3, DOD5, TS1, TS2, TS3, TS4, TS5]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
