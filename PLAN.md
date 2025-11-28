Task: 9303   Title: Implement reportMode full vs summary behavior (subtask 9303.9303003)
Anchors: [cov://§3#coverage-model, cov://§4#coverage-evaluator, cov://§7#json-coverage-report]
Touched files:
- packages/core/src/coverage/evaluator.ts
- packages/core/src/coverage/__tests__/evaluator.test.ts

Approach:
Pour cette sous-tâche 9303.9303003, je vais compléter limplémentation de lévaluateur de couverture pour prendre en compte `reportMode` selon le modèle et le format de rapport décrits dans la SPEC coverage-aware (cov://§3#coverage-model, cov://§4#coverage-evaluator, cov://§7#json-coverage-report). Lidée est de maintenir un calcul de métriques strictement basé sur lunivers complet de cibles construit par lAnalyzer (mêmes inputs que pour le mode full), puis dappliquer un pur post-traitement déterministe qui sélectionne ce qui est effectivement sérialisé dans les tableaux `targets` et `uncoveredTargets` du rapport JSON. Concrètement, jintroduirai une fonction utilitaire dans `evaluator.ts` qui prendra en entrée `reportMode`, la liste complète des cibles (avec `hit`) et la liste `uncoveredTargets` produite par lévaluateur, et retournera des tableaux adaptés au mode : en `full`, `targets` sera la liste intégrale des cibles pour les dimensions actives et `uncoveredTargets` contiendra lensemble des cibles non couvertes (y compris les cibles diagnostiques marquées `deprecated`), ordonnées de façon déterministe ; en `summary`, `targets` pourra être omis/cappé et `uncoveredTargets` sera tronqué à un sous-ensemble priorisé, sans jamais recalculer ni approcher les métriques. Les tests unitaires dans `evaluator.test.ts` couvriront les deux modes, en vérifiant que les métriques restent identiques entre `full` et `summary` pour un même jeu de cibles, que les tableaux `targets`/`uncoveredTargets` respectent les garanties de la SPEC (univers complet en full, troncature autorisée en summary) et que lordre/priorisation des cibles non couvertes est stable.

Risks/Unknowns:
Le principal risque est de laisser `reportMode` influencer directement le calcul des métriques (par exemple en les recalculant à partir de tableaux tronqués) ou de modifier lunivers logique des cibles (IDs, statuts) au lieu de se limiter à une vue de projection pour la sérialisation. Un autre risque est de définir des heuristiques de troncature trop agressives ou insuffisamment déterministes pour `uncoveredTargets`, ce qui compliquerait linterprétation des rapports entre runs. Enfin, lintégration future dans lorchestrateur pipeline (sous-tâche 9303.9303004) devra consommer cette API sans réimplémenter de logique de filtrage.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true

