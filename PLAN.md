Task: 9301   Title: Derive unreachable targets from existing diagnostics
Anchors: [cov://§3#coverage-model, cov://§3#dimensions, spec://§8-coverage-index-export, spec://§8-early-unsat-checks]
Touched files:
- packages/core/src/coverage/analyzer.ts
- packages/core/src/coverage/__tests__/analyzer.test.ts
- packages/core/src/pipeline/__tests__/pipeline-orchestrator.test.ts

Approach:
Pour cette sous-tâche, je vais enrichir `CoverageAnalyzer` pour dériver un statut `status:'unreachable'` sur un sous-ensemble conservatif de `CoverageTarget` à partir des diagnostics existants et de `CoverageIndex`, conformément à la politique d’unreachables (cov://§3#coverage-model, cov://§3#dimensions). À partir de `planDiag` issu de Compose (spec://§8-early-unsat-checks), j’identifierai les `canonPath` marqués par des diagnostics UNSAT forts (par exemple `UNSAT_NUMERIC_BOUNDS`, `CONTAINS_UNSAT_BY_SUM`, `UNSAT_AP_FALSE_EMPTY_COVERAGE`, `UNSAT_REQUIRED_*`) et construirai un ensemble de chemins canoniques considérés comme insatisfiables ou bloqués sous AP:false. Lors de la génération des `CoverageTarget` (structure, branches, enum), j’appliquerai ensuite une règle de marquage conservatrice : tout target dont le `canonPath` est égal ou strictement sous un `canonPath` UNSAT sera marqué `status:'unreachable'`, en laissant les autres cibles `status:'active'`. Pour AP:false, je traiterai spécifiquement les cas où `CoverageIndex` prouve une vacuité de couverture (par exemple via `UNSAT_AP_FALSE_EMPTY_COVERAGE`), en marquant les `PROPERTY_PRESENT` correspondants comme `unreachable`, sans jamais considérer un nom comme couvert si `CoverageIndex.has` ne le permet pas (spec://§8-coverage-index-export). Le flux d’instances et les IDs de cibles resteront inchangés : aucun nouveau moteur de preuve ne sera introduit, et les diagnostics resteront la seule source de vérité pour l’unreachability. Enfin, j’étendrai les tests unitaires de l’analyzer et du pipeline pour couvrir au moins un cas UNSAT numérique et un cas AP:false sous présence pressure, et vérifier que seules les cibles pertinentes passent en `status:'unreachable'`.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
