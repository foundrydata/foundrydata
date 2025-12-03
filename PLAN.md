Task: 9402   Title: Write tests for G_valid arrays and golden snapshots — subtask 9402.9402004
Anchors: [spec://§6#phases, spec://§6#generator-repair-contract, spec://§9#arrays-contains, spec://§10#repair-engine]
Touched files:
- PLAN.md
- .taskmaster/docs/9402-traceability.md
- .taskmaster/tasks/tasks.json
- test/fixtures/g-valid-arrays.json
- test/acceptance/arrays/contains-vs-maxitems.spec.ts
- packages/core/src/pipeline/__tests__/pipeline-orchestrator.test.ts

Approach:
Pour la sous-tâche 9402.9402004, je vais ajouter des tests d’intégration centrés sur les arrays G_valid vs non-G_valid en réutilisant les fixtures dédiées (spec://§6#phases, spec://§6#generator-repair-contract, spec://§9#arrays-contains, spec://§10#repair-engine), de façon à prouver que la Repair structurelle est inutile dans la zone G_valid et que le comportement legacy est préservé ailleurs. Concrètement : (1) enrichir les tests pipeline existants pour le motif UUID + contains en s’appuyant sur `test/fixtures/g-valid-arrays.json`, avec un scénario “golden” qui fixe le seed et capture la forme attendue des éléments générés (présence systématique des champs requis `id` et `isGift`, au moins un élément `isGift: true`), tout en vérifiant qu’aucune action de Repair structurelle n’est enregistrée ; (2) ajouter des tests pour un motif explicitement non-G_valid (par exemple l’array `uniqueItems + contains` des fixtures) qui montrent que l’activation du flag G_valid ne modifie ni les items finaux ni les diagnostics, conformément à la séparation de responsabilités décrite dans la SPEC ; (3) optionnellement, intégrer un test d’acceptance léger dans `test/acceptance/arrays/contains-vs-maxitems.spec.ts` ou un nouveau fichier adjacent, qui utilise les mêmes fixtures pour vérifier que les schémas G_valid restent AJV-valid et déterministes sur plusieurs seeds ; (4) garder les snapshots “golden” raisonnables (structure/assertions ciblées plutôt que dumps complets) afin de limiter la fragilité des tests et s’assurer que toute évolution future est intentionnelle. L’ensemble des tests devra rester déterministe pour un tuple (schéma, options, seed) donné et respecter strictement la séparation G_valid / non-G_valid.

DoD:
 - [x] Des tests pipeline (ou d’acceptance) exploitent les fixtures G_valid pour démontrer que les arrays items+contains génèrent des éléments déjà valides (pas de Repair structurelle) en mode G_valid.
 - [x] Des tests symétriques pour des arrays non-G_valid montrent que l’activation du flag G_valid ne change pas les items finaux ni les diagnostics, à seed fixé.
 - [x] Les tests restent déterministes pour un tuple (schéma, options, seed) donné et ne fragilisent pas la suite via des snapshots trop verbeux.
 - [x] build/typecheck/lint/test/bench OK.

Parent bullets couverts: [KR2, KR3, KR4, DEL3, DOD1, DOD2, DOD3, TS1, TS2, TS4]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
