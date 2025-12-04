Task: 9503   Title: Enforce Score-based commit rule in Repair engine — subtask 9503.9503002
Anchors: [spec://§10#repair-philosophy, spec://§10#repair-philosophy-progress, spec://§6#generator-repair-contract]
Touched files:
- PLAN.md
- .taskmaster/docs/9503-traceability.md
- .taskmaster/tasks/tasks.json
- packages/core/src/repair/repair-engine.ts
- packages/core/src/repair/__tests__/mapping-repair.test.ts
- agent-log.jsonl

Approach:
Pour la sous-tâche 9503.9503002, je vais implémenter un mécanisme de revert déterministe des tentatives de Repair basé sur Score(x), en s’appuyant sur le câblage existant de `computeScore` dans `repair-engine`. En m’appuyant sur `spec://§10#repair-philosophy`, `spec://§10#repair-philosophy-progress` et `spec://§6#generator-repair-contract`, je vais (1) enregistrer Score(x) pour l’instance originale en sortie du premier `validateFn(original)` et suivre, via un accumulateur, les erreurs AJV de la dernière validation dans la boucle de Repair, (2) après la boucle, calculer Score(x') sur l’instance candidate et comparer Score(x') à Score(x); si Score(x') >= Score(x), restaurer de manière déterministe l’instance initiale (en réutilisant la valeur `original` plutôt qu’un clone pour éviter toute perturbation d’ordre de clés), (3) veiller à ce que ce revert ne modifie ni l’ordre des actions internes ni la logique de budgets/stagnation existante, en particulier en laissant les diagnostics/metrics de revert détaillés à la sous-tâche suivante tout en garantissant que les items renvoyés par `repairItemsAjvDriven` respectent déjà la règle de commit basée sur Score, puis (4) étendre les tests `mapping-repair.test.ts` (ou adjacents) pour vérifier que, dans un scénario contrôlé, un Score qui ne s’améliore pas force le revert de l’instance tout en restant déterministe pour un tuple de déterminisme fixé, avant de rejouer build/typecheck/lint/test/bench.

DoD:
- [x] Le moteur de Repair applique la règle de commit Score-based au niveau de l’instance: si Score(x') >= Score(x) après la boucle de Repair, l’instance retournée est restaurée à son état initial, sans modifier la sémantique AJV ni l’ordre des actions internes.
- [x] Les tests ciblés montrent qu’un scénario synthétique où Score(x') est forcé à ne pas s’améliorer (via stub contrôlé) conduit à un revert déterministe de l’instance, sans introduire de non‑déterminisme ou de modifications d’ordre de clés.
- [x] Les diagnostics et métriques liés aux reverts restent inchangés à ce stade (ils seront enrichis dans 9503.9503003), mais la structure de la boucle et les points d’extension nécessaires sont en place.
- [x] La suite build/typecheck/lint/test/bench reste verte après ces changements, confirmant que le mécanisme de revert est neutre vis‑à‑vis du reste du pipeline et compatible avec les contraintes de budgets/stagnation existantes.

Parent bullets couverts: [KR2, DEL2, DOD2, TS2]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
