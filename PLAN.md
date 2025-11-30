Task: 9310   Title: Map schema targets to operations for coverage.byOperation
Anchors: [cov://§3#coverage-model, spec://§7#pass-order]
Touched files:
- packages/core/src/coverage/coverage-analyzer-openapi.ts
- packages/core/src/coverage/analyzer.ts
- packages/core/src/coverage/__tests__/coverage-analyzer-openapi.spec.ts
- packages/core/src/coverage/__tests__/evaluator.test.ts
- .taskmaster/docs/9310-traceability.md

Approach:
Pour 9310.9310003, je vais implémenter le mapping déterministe entre cibles de schéma et opérations pour alimenter `coverage.byOperation` (cov://§3#coverage-model) sans changer les `CoverageTarget.id` existants. Côté analyzer, je m’appuierai sur le `CoverageGraph` enrichi d’`OperationNode` et d’arêtes OpenAPI pour construire une table de correspondance interne (par exemple un mapping nodeId → set d’operationKey) dérivée du graphe, plutôt que d’injecter `operationKey` dans les cibles de structure/branches/enum afin de préserver la stabilité des IDs (spec://§7#pass-order). Côté evaluator, j’étendrai l’interface interne pour recevoir à la fois les `targets` et cette table de mapping, puis je calculerai `coverage.byOperation[operationKey]` comme ratio sur la projection de tous les targets éligibles (cibles `OP_*` plus cibles de structure/branches/enum/boundaries atteignables depuis l’opération et dont la dimension est activée), en gardant `coverage.overall` et `coverage.byDimension` inchangés. Les cas où la dimension `operations` est désactivée continueront à exclure les cibles `OP_*` mais conserveront, via le mapping, les contributions des cibles de schéma aux ratios par opération, conformément à la SPEC. Enfin, j’ajouterai des tests unitaires dans `coverage-analyzer-openapi.spec.ts` et `evaluator.test.ts` qui couvrent: (a) la projection multi-opération (un même target contribuant à plusieurs `coverage.byOperation[operationKey]`), (b) la stabilité des métriques quand on active/désactive la dimension `operations`, et (c) l’absence d’impact sur les IDs et les métriques globales.

Risks/Unknowns:
- Le mapping multi-opérations doit respecter l’invariant de stabilité des IDs: je veillerai à ce que les `CoverageTarget` restent identiques (dimension, kind, canonPath, params, id) et que le mapping vers les opérations vive dans une structure séparée (graphe ou table), utilisée uniquement au moment du calcul de `coverage.byOperation`.
- Propager `CoverageGraph` ou une vue dérivée vers l’evaluator augmentera légèrement le couplage entre analyzer et evaluator; je garderai cette extension minimale (types internes) et limiterai l’usage du graphe au calcul des métriques par opération pour ne pas introduire de dépendances circulaires.
- Les tests devront s’assurer que, pour un même tuple `(schema canonique, OpenAPI, options, seed, ajvMajor, registryFingerprint)`, le `CoverageGraph`, les targets et les ratios `coverage.byOperation` restent déterministes et que l’activation/désactivation de la dimension `operations` n’affecte ni les IDs ni `coverage.overall`.

Parent bullets couverts: [KR3, KR6, DEL2, DOD1, DOD4, TS2, TS4]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
