Task: 9403   Title: Add fixtures and tests for G_valid objects — subtask 9403.9403003
Anchors: [spec://§6#phases, spec://§6#generator-repair-contract, spec://§9#generator]
Touched files:
- PLAN.md
- .taskmaster/docs/9403-traceability.md
- .taskmaster/tasks/tasks.json
- test/fixtures/g-valid-objects.json
- test/acceptance/objects/g-valid-objects.spec.ts

Approach:
Pour la sous-tâche 9403.9403003, je vais ajouter des fixtures et des tests dédiés pour documenter le comportement des objets G_valid vs non-G_valid, en capitalisant sur la logique déjà implémentée pour 9403.9403001/9403.9403002 (spec://§6#phases, spec://§6#generator-repair-contract, spec://§9#generator). Concrètement : (1) créer un petit fichier de fixtures `test/fixtures/g-valid-objects.json` qui encode au moins un schéma d’objet G_valid simple avec propriétés imbriquées (nested required, sans AP:false/unevaluated*) et un schéma d’objet non-G_valid (AP:false et/ou unevaluatedProperties:false) servant de contraste ; (2) ajouter un test d’acceptance dans `test/acceptance/objects/g-valid-objects.spec.ts` qui exécute le pipeline sur le schéma G_valid avec `planOptions.gValid: true` et vérifie que chaque instance générée contient tous les champs requis (y compris imbriqués) et qu’aucune action de Repair structurelle n’est enregistrée ; (3) ajouter un second test d’acceptance qui exécute le pipeline sur le schéma non-G_valid en faisant varier le flag G_valid et qui confirme que les items finaux restent identiques, de façon à montrer que les objets AP:false/unevaluated* sont hors de la zone G_valid et conservent le comportement legacy ; (4) garder les assertions centrées sur la structure (présence/typenage des champs, stabilité des items) pour préserver le déterminisme et éviter des snapshots lourds, puis valider l’ensemble via build/typecheck/lint/test/bench.

DoD:
- [x] Un fichier de fixtures dédié regroupe au moins un schéma d’objet G_valid (avec required imbriqués) et un schéma d’objet non-G_valid (AP:false/unevaluated*), réutilisables par plusieurs tests.
- [x] Des tests d’acceptance valident que les objets G_valid sortent du pipeline avec tous les champs requis présents (y compris imbriqués) et sans Repair structurelle.
- [x] Des tests d’acceptance démontrent que les objets non-G_valid (AP:false/unevaluated*) restent strictement stables lorsque le flag G_valid est activé ou désactivé.
- [x] La suite build/typecheck/lint/test/bench reste verte après l’ajout des fixtures et tests, montrant l’absence de régression globale.

Parent bullets couverts: [KR2, KR3, DEL3, DOD2, DOD3, TS2, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
