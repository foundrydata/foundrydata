Task: 9401   Title: Add tests for motif classification — subtask 9401.9401004
Anchors: [spec://§6#phases, spec://§6#generator-repair-contract, spec://§8#compose, spec://§9#generator]
Touched files:
- PLAN.md
- .taskmaster/docs/9401-traceability.md
- .taskmaster/tasks/tasks.json
- packages/core/src/transform/g-valid-classifier.ts
- packages/core/src/transform/__tests__/g-valid-classifier.spec.ts

Approach:
Pour la sous-tâche 9401.9401004, je vais renforcer les tests autour de `classifyGValid` afin de couvrir plus complètement les motifs G_valid v1 et les cas d’exclusion décrits dans la SPEC (spec://§6#phases, spec://§6#generator-repair-contract, spec://§8#compose, spec://§9#generator), sans modifier le comportement du classifieur au-delà de ce qui est déjà implémenté. Concrètement : (1) ajouter des cas AP:false combinés avec `patternProperties`/`propertyNames` en injectant un `CoverageIndex` synthétique pour vérifier que ces objets restent non-G_valid et sont marqués avec le motif attendu (actuellement `ApFalseMustCover`), ce qui renforce la couverture des exclusions AP:false/CoverageIndex ; (2) ajouter des cas d’arrays avec sacs de `contains` plus complexes (plusieurs `contains` via `allOf`, présence de `unevaluatedItems`/`uniqueItems`) pour vérifier que le classifieur n’upgrade jamais ces formes en `ArrayItemsContainsSimple` et les garde hors de la zone G_valid ; (3) ajouter des cas avec `unevaluatedProperties`/`unevaluatedItems` à différents niveaux (racine, branches `allOf`) afin de garantir que le flag de garde est bien propagé et bloque la classification G_valid là où des guards unevaluated* s’appliquent ; (4) enfin, ajouter un test de stabilité/déterminisme qui exécute `classifyGValid` sur des variantes de schémas canoniques équivalents (par exemple en permutant l’ordre de branches `allOf`) et qui vérifie au minimum que la classification au niveau racine (`#/`) reste identique et que la fonction est pure pour des entrées fixées. Je resterai strictement REFONLY vis-à-vis de la SPEC, en n’introduisant pas de nouveaux motifs ni de diagnostics dans cette sous-tâche.

DoD:
- [x] Les tests couvrent les cas AP:false + CoverageIndex, y compris en présence de patternProperties/propertyNames, et confirment que ces motifs restent non-G_valid.
- [x] Les tests couvrent des arrays avec sacs de contains et des guards unevaluated* (unevaluatedProperties/unevaluatedItems), en vérifiant que le classifieur reste conservatif (pas de faux positifs G_valid).
- [x] Un test de stabilité/déterminisme démontre que la classification est déterministe pour un schéma canonique fixé (y compris sous permutations allOf contrôlées).
- [x] build/typecheck/lint/test/bench OK.

Parent bullets couverts: [KR1, KR2, KR3, DEL3, DOD2, DOD3, TS1, TS2, TS3, TS4]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
