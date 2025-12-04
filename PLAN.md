Task: 9503   Title: Enforce Score-based commit rule in Repair engine — subtask 9503.9503001
Anchors: [spec://§10#repair-philosophy, spec://§10#repair-philosophy-progress, spec://§6#generator-repair-contract]
Touched files:
- PLAN.md
- .taskmaster/docs/9503-traceability.md
- .taskmaster/tasks/tasks.json
- packages/core/src/repair/score/score.ts
- packages/core/src/repair/repair-engine.ts
- packages/core/src/repair/__tests__/mapping-repair.test.ts
- agent-log.jsonl

Approach:
Pour la sous-tâche 9503.9503001, je vais intégrer le calcul de Score(x) dans la boucle de tentative d’actions du moteur de Repair, sans encore modifier la règle de commit/revert (qui appartiendra aux sous-tâches suivantes). En m’appuyant sur `spec://§10#repair-philosophy`, `spec://§10#repair-philosophy-progress` et `spec://§6#generator-repair-contract`, je vais (1) relire les helpers Score déjà implémentés (`canonPathFromError`, `buildErrorSignature`, `computeScore`) et identifier le point unique dans `repair-engine` où AJV allErrors:true est déjà disponible pour évaluer les erreurs d’une instance candidate, (2) introduire un appel déterministe à `computeScore` pour calculer Score(x) pour l’instance courante et pour chaque tentative d’instance réparée, en veillant à ne pas casser le contrat existant Generator/Repair ni à doubler des validations coûteuses, (3) exposer ces scores de manière interne (par exemple via un petit objet de contexte ou une structure de retour enrichie) afin que la sous-tâche suivante puisse brancher la logique de commit/revert sans changer l’ordre des actions ni l’idempotence du moteur, puis (4) mettre à jour les tests `mapping-repair.test.ts` (ou en ajouter de nouveaux) pour vérifier que, pour quelques schémas/instances synthétiques, les scores sont calculés de façon stable et alignés avec la définition de Score(x), avant de relancer build/typecheck/lint/test/bench.

DoD:
- [x] Le moteur de Repair appelle de manière déterministe les utilitaires Score pour l’instance courante et pour les candidats réparés aux points prévus par la SPEC, sans changer l’ordre des actions ni introduire de non‑déterminisme.
- [x] Les tests ciblés montrent que Score(x) observé dans le moteur de Repair correspond à la définition basée sur les signatures d’erreurs (utilisation de `computeScore`) pour des cas simples, sans impacter les invariants G_valid.
- [x] La structure interne retournée par la boucle de tentative expose suffisamment d’information (scores avant/après) pour permettre à la sous‑tâche suivante d’implémenter la règle de commit/revert sans refactor invasif.
- [x] La suite build/typecheck/lint/test/bench reste verte après ces changements, confirmant que le wiring de Score(x) est neutre vis‑à‑vis du comportement observable actuel (pas encore de revert forcé).

Parent bullets couverts: [KR1, DEL1, DOD1, TS1]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
