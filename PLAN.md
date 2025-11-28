Task: 9311   Title: Implement CoverageReport diff classification logic (subtask 9311.9311001)
Anchors: [cov://§7#multi-run-diff, cov://§7#json-coverage-report]
Touched files:
- packages/reporter/src/coverage/coverage-diff.ts
- packages/reporter/src/coverage/__tests__/coverage-diff.spec.ts

Approach:
Pour la sous-tâche 9311.9311001, je vais implémenter la logique de classification de diff entre deux CoverageReport (coverage-report/v1) en me basant sur la structure définie dans les types partagés et sur la section Multi-run diff de la SPEC coverage-aware (cov://§7#multi-run-diff, cov://§7#json-coverage-report). J’ajouterai un nouveau module packages/reporter/src/coverage/coverage-diff.ts qui expose une fonction pure prenant deux CoverageReport (A et B) et renvoyant une structure de diff avec quatre catégories de cibles : unchanged, added, removed et statusChanged. L’algorithme itérera sur les targets des deux rapports en construisant un index par id et en vérifiant que la shape d’identification (dimension, kind, canonPath) est cohérente avant de classer une cible comme diffable; en cas de mismatch de shape pour un même id, je traiterai cela comme une incompatibilité et laisserai la responsabilité de lever une erreur ou de court-circuiter au niveau d’une tâche ultérieure centrée sur la validation des préconditions de diff.

Dans ce module, je veillerai à ne pas modifier ni dépendre de dimensionsEnabled ou excludeUnreachable pour les IDs : les CoverageTargetReport.id restent la source d’identité stable entre rapports, conformément aux invariants coverage-aware. La fonction de diff matérialisera explicitement la liste des cibles newlyUncovered en se basant sur les targets de B qui sont soit nouvelles (added) et non couvertes (hit:false), soit présentes dans A et B mais avec un passage de hit:true à hit:false (statusChanged avec hit qui régresse). Ces informations seront produites dans une structure de sortie simple et sérialisable que la sous-tâche suivante pourra enrichir avec des métriques agrégées. Enfin, j’ajouterai des tests unitaires ciblés dans packages/reporter/src/coverage/__tests__/coverage-diff.spec.ts pour couvrir chaque catégorie, en travaillant sur de petits fixtures inline, avec l’objectif d’atteindre ≥80 % de couverture sur le nouveau module coverage-diff.ts.

Risks/Unknowns:
Les principaux risques concernent la gestion des cas limites : ids présents dans les deux rapports mais avec une shape divergente (dimension/kind/canonPath modifiés entre versions), cibles marquées unreachable ou deprecated, et rapports partiellement incompatibles (version ou FoundryData major différente). La validation stricte de ces préconditions est plutôt du ressort des sous-tâches orientées CLI et métriques; dans cette sous-tâche, je considérerai comme hors scope la logique de validation de version/engine et je me concentrerai sur une classification robuste, en documentant les hypothèses dans les tests et en laissant la possibilité au code appelant de décider quoi faire en cas de mismatch de shape. Je noterai également dans les tests les attentes sur le traitement des cibles unreachable pour ne pas les faire disparaître silencieusement du diff.

Parent bullets couverts: [KR1, DOD1, TS1]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true