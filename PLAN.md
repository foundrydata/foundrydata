Task: 9300   Title: Define coverage core types and ID semantics
Anchors: [cov://§3#coverage-model, cov://§3#coverage-targets, cov://§3#dimensions]
Touched files:
- packages/shared/src/coverage/index.ts
- packages/shared/src/index.ts
- packages/shared/src/coverage/__tests__/coverage-types.test.ts
- packages/core/src/coverage/index.ts
- packages/core/src/coverage/id-generator.ts
- packages/core/src/coverage/__tests__/id-generator.test.ts
- packages/core/src/index.ts

Approach:
Pour cette tâche, je vais d’abord introduire une union canonique CoverageDimension dans le package shared, avec un ensemble de constantes exportées garantissant que les clés de dimension ('structure', 'branches', 'enum', 'boundaries', 'operations') sont stables et réutilisables côté core et reporter, conformément au modèle coverage-aware (cov://§3#coverage-model, cov://§3#dimensions). Sur cette base, je définirai CoverageTarget et CoverageTargetReport dans shared en suivant la forme simplifiée de la SPEC (cov://§3#coverage-targets), en ajoutant des unions de statuts ('active' | 'unreachable' | 'deprecated'), de polarité et un espace de noms pour les kinds, incluant notamment SCHEMA_REUSED_COVERED pour les cibles purement diagnostiques. Côté core, j’ajouterai un module coverage/index qui réexporte les types partagés et introduit des types CoverageGraph minimalement structurés (nœuds, arêtes, graphe) alignés avec la notion de CoverageGraph dérivé de la vue canonique, sans réimplémenter la sémantique JSON Schema. J’implémenterai ensuite un générateur d’ID déterministe pour CoverageTarget dans coverage/id-generator.ts, qui ne dépend que des entrées canoniques (dimension, kind, canonPath, operationKey, params) et de deux entiers de contexte (FoundryData major, coverage-report format major). L’ID sera calculé via un hash structuré stable déjà utilisé dans core, de manière à rester indépendant de dimensionsEnabled, excludeUnreachable, status ou des résultats de couverture. Enfin, j’exposerai les types et le générateur via l’index public de @foundrydata/core et ajouterai des tests unitaires et property-based pour vérifier la stabilité des ID et la cohérence des unions de dimensions/kinds avec la SPEC.

Risks/Unknowns:
- Choix exact des kinds de CoverageTarget et de la forme CoverageGraph à exposer en V1, tout en laissant de la marge pour les futures dimensions et raffinements sans casser la stabilité des IDs ni l’API publique.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true

