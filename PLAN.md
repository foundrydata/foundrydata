Task: 9501   Title: Implement stable AJV error signature and Score(x) utilities — subtask 9501.9501001
Anchors: [spec://§10#repair-philosophy, spec://§10#repair-philosophy-progress, spec://§14#planoptionssubkey, spec://§15#metrics]
Touched files:
- PLAN.md
- .taskmaster/docs/9501-traceability.md
- .taskmaster/tasks/tasks.json
- packages/core/src/repair/score/stable-params-key.ts
- packages/core/src/repair/score/__tests__/stable-params-key.test.ts

Approach:
Pour la sous-tâche 9501.9501001, je vais introduire un helper `stableParamsKey(params)` dédié à la canonicalisation JSON stable des `e.params` AJV, en alignement strict avec la définition de Score/sig(e) dans la SPEC. En m’appuyant sur `spec://§10#repair-philosophy` et le paragraphe Score/commit (`spec://§10#repair-philosophy-progress`), ainsi que sur la définition de la canonicalisation JSON utilisée pour le hashing (§10 “structural hashing”) et `PlanOptionsSubKey` (§14), je vais (1) factoriser ou réutiliser la logique de canonicalisation existante si elle est déjà implémentée pour le hashing afin d’éviter deux encodeurs divergents, ou à défaut créer `packages/core/src/repair/score/stable-params-key.ts` avec une implémentation récursive qui trie les clés d’objets, préserve l’ordre des tableaux, normalise `-0` en `0` et encode les primitives de façon déterministe, (2) écrire des tests unitaires dédiés dans `packages/core/src/repair/score/__tests__/stable-params-key.test.ts` couvrant les cas de base (objets imbriqués, tableaux, nombres, booléens, null, BigInt si applicable), des cas d’égalité structurelle (mêmes données avec des ordres de clés différents) et des cas de non-égalité, (3) viser une couverture ≥80 % sur le nouveau module en instrumentant suffisamment de cas edge (clés spéciales, valeurs undefined non sérialisées le cas échéant) et en vérifiant la stabilité inter-run (mêmes entrées → même string), puis (4) relancer build/typecheck/lint/test/bench pour s’assurer que ce helper reste purement déterministe et n’introduit aucune dépendance à la couverture ou à l’état global.

DoD:
DoD:
- [x] Le helper `stableParamsKey(params)` existe, est pur et implémente une canonicalisation JSON stable des paramètres AJV conforme à la SPEC (tri des clés d’objets, ordre stable des tableaux, normalisation de `-0` en `0`, traitement déterministe des primitives).
- [x] Les tests unitaires pour `stableParamsKey` couvrent au moins objets imbriqués, tableaux, nombres (incluant signes et `-0`), booléens, null et cas d’égalité/non-égalité structurelle, avec une couverture ≥80 % sur `stable-params-key.ts`.
- [x] La fonction ne dépend pas de l’état de couverture ni d’aucun état global (elle ne lit pas `coverage`, `dimensionsEnabled` ni des singletons) et peut être utilisée telle quelle par Score/sig(e) sans briser les garanties de déterminisme de §14/§15.
- [x] La suite build/typecheck/lint/test/bench reste verte après l’introduction du helper et de ses tests, confirmant qu’il est correctement isolé et compatible avec le reste de l’implémentation.

Parent bullets couverts: [KR1, DEL1, DOD1, TS1]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
