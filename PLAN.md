Task: 9306   Title: 9306.9306003 – Record unsatisfied hints from generator and repair
Anchors: [cov://§4#generator-instrumentation, cov://§5#unsatisfied-hints-repair]
Touched files:
- packages/core/src/generator/foundry-generator.ts
- packages/core/src/repair/repair-engine.ts
- packages/core/src/coverage/evaluator.ts
- packages/core/src/coverage/__tests__/evaluator.test.ts
- .taskmaster/docs/9306-traceability.md
- PLAN.md

Approach:
Pour la sous-tâche 9306.9306003, je vais ajouter un chemin de retour pour les hints qui n’ont pas pu être honorés par le générateur ou qui sont “défaits” par Repair, de façon à produire des entrées `unsatisfiedHints` conformes à la SPEC dans le rapport de couverture. Concrètement, je vais introduire une petite structure interne pour collecter, côté generator et côté Repair, des événements d’hints non satisfaits (par exemple “branch preferBranch non atteinte”, “coverEnumValue impossible sous les contraintes”, “valeur modifiée par Repair”), en les normalisant vers le type `UnsatisfiedHint` déjà défini dans `@foundrydata/shared`. Ces événements resteront purement diagnostiques: ils seront agrégés dans la couche coverage/evaluator ou directement au moment de la construction du `CoverageReport` dans l’orchestrateur, sans influencer `coverageStatus`, `minCoverage` ni les métriques de coverage.

Du côté tests, je vais étendre les tests de l’Evaluator pour couvrir des scénarios simples où l’on fournit une petite collection d’`unsatisfiedHints` synthétiques en entrée et où l’on vérifie qu’elles sont restituées telles quelles dans `coverageReport.unsatisfiedHints`, sans impact sur `metrics.overall` ou `targetsByStatus`. Pour garder cette sous-tâche concentrée sur la collecte et la propagation, je limiterai le câblage au cas minimal: un hook côté generator/Repair permettant de pousser des `UnsatisfiedHint` dans un accumulateur de run, et l’agrégation finale dans le champ `unsatisfiedHints` du rapport. La logique de classification fine par `reasonCode` restera simple (par exemple `UNREACHABLE_BRANCH`, `REPAIR_MODIFIED_VALUE`, `CONFLICTING_CONSTRAINTS`), en laissant aux sous-tâches ultérieures le soin d’enrichir les diagnostics ou de brancher ces informations dans des vues plus détaillées.

Risks/Unknowns:
Les risques principaux sont : (1) faire dériver la mécanique d’`unsatisfiedHints` vers un changement de comportement (par exemple en court-circuitant Repair ou en modifiant la sélection de branches), alors qu’elle doit rester purement diagnostique; (2) doubler ou perdre des hints lors de l’agrégation, ce qui nuirait à la traçabilité; (3) introduire une dépendance forte à l’implémentation interne des hints de generator, au détriment de la stabilité. Pour les limiter, je vais traiter `unsatisfiedHints` comme un flux parallèle: collecte d’événements structurés, agrégation pure, puis inclusion telle quelle dans le rapport, sans branches conditionnelles sur ces diagnostics. Je veillerai aussi à ce que les tests restent décorrélés des détails d’implémentation de Generator/Repair (ils manipuleront des `UnsatisfiedHint` déjà formés).

Parent bullets couverts: [KR4, DEL3, DOD3, TS3]

SPEC-check: conforme aux anchors listés, aucun écart identifié ; cette sous-tâche se concentre sur la collecte et la propagation des unsatisfiedHints en tant que diagnostics dans le rapport de coverage, sans modifier le comportement de génération ou de réparation ni les métriques de coverage.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
