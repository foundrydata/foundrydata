Task: 9402   Title: Add fixtures for G_valid array motifs — subtask 9402.9402003
Anchors: [spec://§6#phases, spec://§6#generator-repair-contract, spec://§9#arrays-contains, spec://§10#repair-engine]
Touched files:
- PLAN.md
- .taskmaster/docs/9402-traceability.md
- .taskmaster/tasks/tasks.json
- docs/examples/g-valid-uuid-contains.md
- test/fixtures/g-valid-arrays.json

Approach:
Pour la sous-tâche 9402.9402003, je vais extraire et formaliser des fixtures dédiées aux motifs d’arrays G_valid (spec://§6#phases, spec://§6#generator-repair-contract, spec://§9#arrays-contains, spec://§10#repair-engine), en particulier autour du motif de référence UUID + contains déjà documenté dans `docs/examples/g-valid-uuid-contains.md`, afin de servir de base commune aux tests pipeline/générateur. Concrètement : (1) relire l’exemple UUID + contains et en dériver un ou plusieurs schémas JSON minimaux (arrays d’objets avec `id` UUID et `isGift` booléen, contains sur `isGift: true`) en veillant à rester strictement REFONLY vis-à-vis de la SPEC et de l’exemple (aucun copier-coller de prose) ; (2) regrouper ces schémas (et éventuellement d’autres variantes simples : arrays scalaires avec contains const/enum, arrays d’objets sans uniqueItems ni AP:false) dans un petit fichier de fixtures JSON ou TS typé utilisable par les tests 9402 (générateur/pipeline) ; (3) annoter clairement, via les noms de fixtures ou des commentaires concis, quels motifs sont G_valid (items+contains simples) et quels motifs sont explicitement hors G_valid (par exemple arrays avec uniqueItems ou sacs de contains complexes), sans changer la logique de classification existante ; (4) vérifier que ces fixtures s’intègrent bien dans la stratégie de tests existante (notamment les tests ajoutés en 9402.9402002) sans introduire de dépendances circulaires ni de régression de couverture. Aucun changement de comportement n’est attendu dans cette sous-tâche, uniquement la création de données de référence cohérentes avec la SPEC pour les arrays G_valid.

DoD:
 - [x] Des fixtures dédiées aux arrays G_valid (dont le motif UUID + contains) sont disponibles dans un emplacement partagé et clairement identifiées comme telles.
 - [x] Les fixtures couvrent au moins un motif G_valid items+contains et au moins un motif explicitement non-G_valid, en cohérence avec la classification existante.
 - [x] Les tests existants peuvent référencer ces fixtures sans modification de comportement observable (les nouveaux fichiers ne servent que de source de vérité partagée).
 - [x] build/typecheck/lint/test/bench OK.

Parent bullets couverts: [KR2, KR3, DEL3, DOD2, TS2]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
