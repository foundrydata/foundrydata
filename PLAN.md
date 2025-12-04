Task: 9500   Title: Integrate Repair philosophy into canonical spec and align design docs — subtask 9500.9500001
Anchors: [spec://§10#mapping, spec://§10#process-order, spec://§6#generator-repair-contract, spec://§14#planoptionssubkey, spec://§15#metrics]
Touched files:
- PLAN.md
- .taskmaster/docs/9500-traceability.md
- .taskmaster/tasks/tasks.json
- docs/spec-canonical-json-schema-generator.md
- agent-log.jsonl

Approach:
Pour la sous-tâche 9500.9500001, je vais concentrer le travail sur la SPEC canonique §10 sans élargir le périmètre aux implémentations ni aux autres docs. En m’appuyant sur le mapping `(keyword → action)` existant et sur le contrat Generator/Repair + G_valid (§6), je vais introduire une sous-section explicite “Repair philosophy” sous §10 qui sert de couche de policy : elle référencera le tuple de déterminisme fixé en §14/§15, rappellera le rôle des tiers (0–3) et de la politique par défaut en zone G_valid, précisera l’exigence de couverture-indépendance et pointera vers les paragraphes normatifs déjà présents (10.P1–10.P8) pour Score/commit rule, budgets/stagnation et observabilité, sans redéfinir leurs détails. Concrètement, je vais (1) ajouter un en-tête et un court paragraphe de synthèse qui encadrent les paragraphes 10.P1–10.P8 comme “Repair philosophy”, (2) vérifier que les formulations restent compatibles avec les invariants de §6 (structuralKeywords bloqués dans G_valid, pas d’extension de budgets) et avec l’ordre de traitement existant (§10 Process), (3) créer ou mettre à jour `.taskmaster/docs/9500-traceability.md` pour introduire des bullets stables qui capturent les KRs/Deliverables liés à la SPEC, et mapper cette sous-tâche à ces bullets, puis (4) relire la SPEC autour de §6/§10/§14/§15 pour détecter toute contradiction ou duplication manifeste avant d’exécuter build/typecheck/lint/test/bench.

DoD:
- [x] La SPEC canonique §10 contient une sous-section “Repair philosophy” clairement identifiée, qui cadre les paragraphes 10.P1–10.P8 sans modifier les règles normatives existantes (tiers, Score, budgets, coverage-indépendance, G_valid).
- [x] Les renvois croisés entre §6 (G_valid / structuralKeywords), §10 (mapping et process), §14 (PlanOptionsSubKey) et §15 (métriques/déterminisme) restent cohérents et ne créent pas de nouvelles obligations côté implémentation.
- [x] Le fichier `.taskmaster/docs/9500-traceability.md` existe, décrit les principaux KR/Deliverables/DoD pour le parent 9500 et mappe explicitement cette sous-tâche 9500.9500001 à au moins un bullet de chaque catégorie pertinente.
- [x] La suite build/typecheck/lint/test/bench reste verte après la mise à jour de la SPEC, confirmant que la documentation est alignée sur l’implémentation actuelle et n’introduit pas de régression de tooling.

Parent bullets couverts: [KR1, DEL1, DOD1, TS1]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
