Task: 9332   Title: Refine boundaries and operations coverage model — subtask 9332.9332003
Anchors: [cov://§3#coverage-model, cov://§3#dimensions-v1, cov://§9#boundaries-openapi-diff]
Touched files:
- packages/core/src/coverage/diff.ts
- packages/core/src/coverage/__tests__/coverage-diff.spec.ts
- .taskmaster/docs/9332-traceability.md

Approach:
Pour la sous-tâche 9332.9332003, je vais ajouter des tests de diff et d’ID-stability focalisés sur les dimensions `boundaries` et `operations`, en m’appuyant sur le modèle de couverture et la section M2/diff (cov://§3#coverage-model, cov://§3#dimensions-v1, cov://§9#boundaries-openapi-diff). L’objectif est de démontrer que : (1) activer ou désactiver les dimensions `boundaries` et `operations` dans `dimensionsEnabled` ne change jamais les IDs ni les statuts des cibles des autres dimensions (structure/branches/enum) pour un schéma donné; (2) `diffCoverageReports` et les structures de diff continuent de fonctionner proprement quand un rapport contient des cibles boundaries/operations et l’autre non, en traitant ces cibles comme des ajouts/suppressions sans signaler de problème de compatibilité. Concrètement, je vais introduire dans `coverage-diff.spec.ts` un couple de rapports synthétiques (ou construits via `evaluateCoverage`) qui ne diffèrent que par la présence des dimensions `boundaries`/`operations`, et vérifier : (a) que l’ensemble des IDs non-boundaries/non-operations est identique des deux côtés; (b) que le diff classe uniquement les cibles boundaries/operations dans les deltas, sans remapper les IDs des autres; (c) que le résumeur/compatibility checker reste stable et n’élève pas de warning inattendu pour ce cas.

Risks/Unknowns:
- Construire des rapports synthétiques trop proches de l’implémentation interne de diff pourrait rendre les tests fragiles à des refactors bénins; je veillerai à les exprimer dans le vocabulaire de la spec (targets, dimensions, metrics) plutôt qu’en supposant des détails de représentation.
- Selon la manière dont `diffCoverageReports` gère les rapports avec un set de dimensions différents, certains cas pourraient être déjà couverts par les tests actuels; il faudra éviter le doublon et cibler spécifiquement le scénario “dimensionsEnabled limites” demandé par 9332.
- Le contrôle de compatibilité (`checkCoverageDiffCompatibility`) doit rester strict sur les changements de version/report; les tests devront rester dans le périmètre “même version, dimensions togglées” pour ne pas brouiller les assertions.

Parent bullets couverts: [KR3, DEL3, DOD3, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
