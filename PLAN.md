Task: 9506   Title: Add micro-schemas + E2E assertions for tier behavior, G_valid regressions, and UNSAT stability — subtask 9506.9506002
Anchors: [spec://§10#repair-philosophy, spec://§10#mapping, spec://§6#generator-repair-contract, spec://§19#envelope, spec://§15#metrics]
Touched files:
- PLAN.md
- .taskmaster/docs/9506-traceability.md
- .taskmaster/tasks/tasks.json
- packages/core/src/pipeline/__tests__/repair-tier-policy.integration.test.ts
- agent-log.jsonl

Approach:
Pour la sous-tâche 9506.9506002, je vais ajouter des tests E2E au niveau pipeline qui consomment les micro-schemas « repair-philosophy » et asservent les compteurs de tiers et les diagnostics associés, sans modifier le comportement existant de Repair. En m’appuyant sur `spec://§10#repair-philosophy`, `spec://§10#mapping`, `spec://§6#generator-repair-contract`, `spec://§19#envelope` et `spec://§15#metrics`, je vais (1) créer un fichier `repair-tier-policy.integration.test.ts` dans les tests pipeline qui exécute `executePipeline` sur des fixtures Tier-1 only, Tier-2 hors G_valid et G_valid structurels avec des options strictes et coverage=off, (2) vérifier pour les motifs Tier-1/Tier-2 hors G_valid que des actions de Repair sont bien présentes et que les métriques agrégées (`repair_tier1_actions`, `repair_tier2_actions`, `repair_tierDisabled`, `repairActionsPerRow`) reflètent des décisions cohérentes avec la policy par défaut, (3) vérifier pour les motifs G_valid structurels que les comportements observés (actions et diagnostics REPAIR_GVALID_STRUCTURAL_ACTION ou similaires) restent compatibles avec les tests existants, sans exiger de nouveau blocage plus strict que ce que l’engine implémente aujourd’hui, et (4) rejouer build/typecheck/lint/test/bench pour valider que ces tests E2E sont stables et ne rendent pas la policy plus stricte que ce qui est déjà spécifié, tout en documentant dans la trace 9506 comment ils couvrent DEL2/DOD2/TS2.

DoD:
- [x] Au moins un test pipeline par motif (Tier-1 only, Tier-2 hors G_valid, G_valid structurel) consomme les micro-schemas de `repair-philosophy-microschemas` et vérifie les actions Repair et diagnostics clés sans introduire de nouveaux comportements dans l’engine.
- [x] Les métriques agrégées de tiers (`repair_tier1_actions`, `repair_tier2_actions`, `repair_tier3_actions`, `repair_tierDisabled`, `repairActionsPerRow`) sont observées dans ces tests et restent cohérentes entre runs répétés pour un tuple de paramètres fixé.
- [x] Les diagnostics Repair utilisés dans ces tests (codes et phases) respectent `diagnosticsEnvelope.schema.json` et restent compatibles avec les invariants existants de la suite (pas de réécriture de code/phase).
- [x] La suite build/typecheck/lint/test/bench est verte avec ces nouveaux tests E2E, et la trace 9506 documente comment DEL2/DOD2/TS2 sont couverts par cette sous-tâche.

Parent bullets couverts: [DEL2, DOD2, TS2]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true

DoD:
- [ ] La documentation interne (traceability 9506 et commentaires de fixtures) reste alignée avec les tests E2E ajoutés, de sorte qu’il est facile de relier chaque micro-schema aux assertions de tiers/policy dans la suite.

Parent bullets couverts: [DEL3, DOD3, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
