Task: 9404   Title: Add tests and diagnostics for G_valid Repair violations — subtask 9404.9404003
Anchors: [spec://§6#phases, spec://§6#generator-repair-contract, spec://§10#repair-engine]
Touched files:
- PLAN.md
- .taskmaster/docs/9404-traceability.md
- .taskmaster/tasks/tasks.json
- packages/core/src/repair/repair-engine.ts
- packages/core/src/repair/__tests__/mapping-repair.test.ts

Approach:
Pour la sous-tâche 9404.9404003, je vais ajouter des tests ciblés et valider les diagnostics pour les violations du contrat G_valid côté Repair, en m’appuyant sur le garde structurel introduit précédemment (spec://§6#phases, spec://§6#generator-repair-contract, spec://§10#repair-engine). Concrètement : (1) étendre `mapping-repair.test.ts` avec un petit schéma d’objet G_valid (SimpleObjectRequired) et/ou d’array G_valid (ArrayItemsContainsSimple) pour lequel je force une instance manuellement invalide (champ required manquant, minItems non satisfaites) et exécute `repairItemsAjvDriven` avec `planOptions.gValid: true`, en vérifiant que les actions `addRequired*`/`minItemsGrow` ne sont plus appliquées et qu’au moins un diagnostic `REPAIR_GVALID_STRUCTURAL_ACTION` est émis ; (2) ajouter un test miroir pour un schéma non-G_valid (AP:false/unevaluated* ou array avec uniqueItems) montrant que les mêmes erreurs AJV continuent de déclencher des Repair structurels et qu’aucun diagnostic G_valid n’est émis, prouvant que le garde reste localisé ; (3) ajouter un test qui active explicitement `repair.allowStructuralInGValid: true` pour un schéma G_valid et démontre que les Repair structurels redeviennent actifs (actions présentes, pas de diagnostic `REPAIR_GVALID_STRUCTURAL_ACTION`), pour valider le feature flag de compatibilité ; (4) revalider build/typecheck/lint/test/bench et mettre à jour la traçabilité 9404 pour marquer les KR/DEL/DOD/TS liés aux violations Repair comme couverts.

DoD:
- [x] Des tests unitaires démontrent qu’en zone G_valid, des erreurs AJV qui déclencheraient normalement des Repair structurels produisent désormais des diagnostics `REPAIR_GVALID_STRUCTURAL_ACTION` sans actions structurelles associées.
- [x] Des tests unitaires démontrent qu’en zone non-G_valid, les Repair structurels et diagnostics existants restent inchangés (pas de régressions).
- [x] Un test valide que `repair.allowStructuralInGValid: true` rétablit le comportement structural précédent en G_valid, sans diagnostics `REPAIR_GVALID_STRUCTURAL_ACTION`.
- [x] La suite build/typecheck/lint/test/bench reste verte après l’ajout des tests, confirmant l’intégration correcte des diagnostics.

Parent bullets couverts: [KR2, KR3, DEL3, DOD2, DOD3, TS2, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
