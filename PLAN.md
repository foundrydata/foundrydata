Task: 9330   Title: Harden coverage invariants (unreachable, AP:false, determinism) — subtask 9330.9330003
Anchors: [spec://§3#branch-selection-algorithm, cov://§3#coverage-model, cov://§4#coverage-planner, cov://§6#execution-modes-ux]
Touched files:
- packages/core/test/e2e/coverage-acceptance.spec.ts
- .taskmaster/docs/9330-traceability.md

Approach:
Pour la sous-tâche 9330.9330003, je vais étendre les tests e2e de `executePipeline` dans `coverage-acceptance.spec.ts` afin de couvrir explicitement les invariants de déterminisme et de monotonicité entre `coverage=off`, `coverage=measure` et `coverage=guided`, en m’appuyant sur la spec canonique pour la sélection de branches (spec://§3#branch-selection-algorithm) et sur la spec coverage-aware pour le modèle de couverture, le planner et les modes d’exécution (cov://§3#coverage-model, cov://§4#coverage-planner, cov://§6#execution-modes-ux). Je vais ajouter des scénarios sur un petit schéma JSON Schema simple, un schéma AP:false et un petit OpenAPI (déjà présent dans les fixtures) qui exécutent `executePipeline` avec les trois modes, puis : (1) comparent les items générés entre `off` et `measure` pour s’assurer qu’ils sont byte-identiques (même ordre, même contenus) pour un triplet `(schema, options, seed)` donné; (2) vérifient que `coverage=guided` produit un flux d’instances déterministe pour les mêmes entrées, que les `CoverageTarget.id` et les statuts (y compris `unreachable`) restent identiques à ceux observés en `measure`, et que la couverture (branches/enum) mesurée dans le rapport est ≥ celle de `measure` pour les mêmes cibles; (3) valident que `excludeUnreachable` ne modifie que les dénominateurs des métriques en gardant cibles, IDs et statuts inchangés. Les tests resteront purement observateurs (aucune nouvelle logique) et se contenteront d’appeler l’API publique du pipeline et de comparer les artefacts retournés.

Risks/Unknowns:
- La comparaison “byte-identique” entre items off/measure nécessite de bien contrôler les options (seed, ajvMajor, registryFingerprint); un oubli pourrait rendre les tests fragiles. Je veillerai à fixer explicitement seed et options dans chaque scénario et à comparer la représentation JSON normalisée.
- Les rapports de couverture guided doivent améliorer la couverture sans violer les contraintes de génération; les tests ne doivent pas re-spécifier le comportement interne du planner, mais se limiter à des assertions de monotonie (>=) sur des métriques simples (branches/enum) pour éviter le sur-ajustement.
- Sur OpenAPI, la combinaison des dimensions (structure/branches/enum/operations) et des options de sélection d’opérations peut compliquer les assertions; je choisirai un cas étroit (petit spec, toutes opérations activées) pour garder les tests robustes tout en exerçant byOperation.

Parent bullets couverts: [KR2, KR4, DEL3, DOD3, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
