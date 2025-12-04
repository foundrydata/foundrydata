Task: 9501   Title: Implement stable AJV error signature and Score(x) utilities — subtask 9501.9501002
Anchors: [spec://§10#repair-philosophy, spec://§10#repair-philosophy-progress, spec://§14#planoptionssubkey, spec://§15#metrics]
Touched files:
- PLAN.md
- .taskmaster/docs/9501-traceability.md
- .taskmaster/tasks/tasks.json
- packages/core/src/repair/score/error-signature.ts
- packages/core/src/repair/score/__tests__/error-signature.test.ts

Approach:
Pour la sous-tâche 9501.9501002, je vais implémenter un helper `canonPathFromError(e, mapping)` et un constructeur de signature `buildErrorSignature(e, mapping)` qui matérialisent la définition de `canonPath(e)` et `sig(e)` donnée par la SPEC. En m’appuyant sur `spec://§10#repair-philosophy` et `spec://§10#repair-philosophy-progress`, ainsi que sur la description de `canonPath` et du fallback `schemaPath`, je vais (1) exploiter `PtrMapping` et sa `revPtrMap` existante pour résoudre `e.schemaPath` vers un ou plusieurs `canonPath` potentiels, en sélectionnant de façon déterministe le chemin le plus spécifique (premier de la liste triée) lorsque plusieurs candidats existent, (2) faire tomber le helper en fallback sur `e.schemaPath` (ou `''` si absent) lorsque le mapping est indisponible ou qu’aucun chemin canonique ne correspond, (3) implémenter `buildErrorSignature(e, mapping)` qui assemble `keyword`, `canonPath(e)`, `instancePath` et `stableParamsKey(e.params)` (helper déjà introduit en 9501.9501001) dans une structure simple que Score pourra consommer, sans encore calculer Score(x), et (4) écrire des tests unitaires qui couvrent les cas sans mapping, avec mapping direct, sans correspondance canonique, ainsi que la stabilité de la composante paramsKey vis‑à‑vis de l’ordre des clés, puis relancer build/typecheck/lint/test/bench pour confirmer que ces helpers restent déterministes et indépendants de la coverage.

DoD:
DoD:
- [x] Le helper `canonPathFromError(e, mapping)` résout `canonPath(e)` via le mapping canonique quand il existe et retombe de façon déterministe sur `e.schemaPath` sinon, en accord avec la définition de §10.P5.
- [x] La fonction `buildErrorSignature(e, mapping)` construit la quadruple `(keyword, canonPath(e), instancePath, stableParamsKey(e.params))` et peut être utilisée telle quelle par Score(x) sans recalcul ou duplication de logique.
- [x] Les tests unitaires pour ces helpers couvrent les scénarios avec et sans mapping, les cas sans correspondance canonique, et vérifient que la composante paramsKey est stable face à des permutations d’objets `params`, avec une couverture ≥80 % sur `error-signature.ts`.
- [x] La suite build/typecheck/lint/test/bench reste verte après ces changements, confirmant que les helpers sont isolés et ne modifient pas le comportement existant en dehors de la nouvelle surface Score.

Parent bullets couverts: [KR1, DEL2, DOD1, TS2]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
