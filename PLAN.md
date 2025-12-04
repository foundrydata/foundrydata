Task: 9501   Title: Implement stable AJV error signature and Score(x) utilities — subtask 9501.9501003
Anchors: [spec://§10#repair-philosophy, spec://§10#repair-philosophy-progress, spec://§14#planoptionssubkey, spec://§15#metrics]
Touched files:
- PLAN.md
- .taskmaster/docs/9501-traceability.md
- .taskmaster/tasks/tasks.json
- packages/core/src/repair/score/score.ts
- packages/core/src/repair/score/__tests__/score.test.ts

Approach:
Pour la sous-tâche 9501.9501003, je vais implémenter un helper `computeScore(errors, mapping)` qui calcule `Score(x)` comme la cardinalité de l’ensemble des signatures `sig(e)` définies en §10.P5, en s’appuyant sur les helpers précédents. En m’appuyant sur `spec://§10#repair-philosophy` et `spec://§10#repair-philosophy-progress`, je vais (1) consommer les `AjvErrorObject` issus d’AJV (ou de notre type `AjvErr`) et construire pour chacun une signature structurée via `buildErrorSignature(e, mapping)`, (2) dédupliquer les signatures via une clé de set déterministe (par exemple JSON d’un tuple `[keyword, canonPath, instancePath, paramsKey]`) pour obtenir le nombre de signatures distinctes, en veillant à ce que l’ordre des erreurs n’influence pas le résultat, (3) traiter proprement les listes vides ou nulles et les duplications triviales (mêmes erreurs répétées, variations d’ordre des propriétés `params`) afin que Score(x) reste stable, et (4) écrire des tests unitaires pour `Score(x)` couvrant liste vide, erreurs distinctes, duplications exactes et duplications qui ne diffèrent que par l’ordre des paramètres, puis relancer build/typecheck/lint/test/bench pour confirmer que cette implémentation reste pure, déterministe et indépendante de la coverage.

DoD:
DoD:
- [x] Le helper `computeScore(errors, mapping)` calcule `Score(x)` comme la cardinalité des signatures `sig(e)` définies par la SPEC, en utilisant `buildErrorSignature` pour construire les signatures et en restant insensible à l’ordre des erreurs.
- [x] Les tests unitaires pour Score(x) couvrent les cas de liste vide, d’erreurs distinctes, de duplications exactes et de duplications où seules les propriétés `params` sont réordonnées, avec une couverture ≥80 % sur `score.ts`.
- [x] Aucune dépendance à l’état de coverage ou à des singletons n’est introduite (la fonction ne lit pas `coverage`, `dimensionsEnabled` ou des structures globales) et son comportement reste déterministe pour un tuple de déterminisme donné.
- [x] La suite build/typecheck/lint/test/bench reste verte après l’introduction de Score(x) et de ses tests, confirmant que l’implémentation est prête à être utilisée par le moteur de Repair pour la règle de commit.

Parent bullets couverts: [KR2, KR3, DEL3, DOD2, DOD3, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
