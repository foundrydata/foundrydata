Task: 9504   Title: Implement Repair tier classification and default tier policy — subtask 9504.9504003
Anchors: [spec://§10#repair-philosophy, spec://§10#mapping, spec://§6#generator-repair-contract, spec://§19#envelope]
Touched files:
- PLAN.md
- .taskmaster/docs/9504-traceability.md
- .taskmaster/tasks/tasks.json
- packages/core/src/repair/tier-classification.ts
- packages/core/src/repair/__tests__/tier-classification.test.ts
- packages/core/src/repair/__tests__/mapping-repair.test.ts
- agent-log.jsonl

Approach:
Pour la sous-tâche 9504.9504003, je vais compléter la couverture de tests autour du modèle de tiers et de la policy gate afin de rendre observables (et stables) les décisions de tier/policy sans modifier davantage le comportement de Repair. En m’appuyant sur `spec://§10#repair-philosophy`, `spec://§10#mapping`, `spec://§6#generator-repair-contract` et `spec://§19#envelope`, je vais (1) enrichir `tier-classification.test.ts` avec des cas supplémentaires pour `STRUCTURAL_KEYWORDS` et `isActionAllowed`, couvrant la matrice {G_valid/non-G_valid} × {structural/non-structural} × {tier} et vérifiant la stabilité des décisions pour un tuple de déterminisme fixé, (2) ajouter un ou deux tests ciblés dans `mapping-repair.test.ts` qui exercent la policy gate dans le contexte de `repairItemsAjvDriven` en inspectant les métriques de tiers et en validant, via l’API diagnostics, que les enveloppes `REPAIR_TIER_DISABLED` respectent le schéma commun lorsqu’elles sont émises, sans dépendre de cas d’usage fragiles sur le corpus, (3) veiller à ce que ces tests restent purement observateurs (aucun branchement sur l’état de coverage ou des seeds) et qu’ils n’introduisent pas de flakiness, puis (4) rejouer build/typecheck/lint/test/bench pour verrouiller que la couverture de tests est en place et que l’enveloppe diagnostics reste schema‑compatible (`spec://§19#envelope`).

DoD:
- [x] La batterie de tests de `tier-classification.test.ts` couvre explicitement la matrice {G_valid/non-G_valid} × {structural/non-structural} × {tier 0/1/2/3}, y compris les cas avec `allowStructuralInGValid:true`, et reste déterministe pour un tuple de paramètres donné.
- [x] Au moins un test de `mapping-repair.test.ts` vérifie que les décisions de tier/policy sont reflétées dans les métriques (`repair_tier1_actions`, `repair_tier2_actions`, `repair_tierDisabled`) sans modifier les invariants de Score ou la sémantique de commit/revert.
- [x] Les diagnostics `REPAIR_TIER_DISABLED` produits par la policy gate, lorsqu’ils sont exercés dans les tests, respectent `diagnosticsEnvelope.schema.json` via `assertDiagnosticEnvelope` et ne perturbent pas les autres diagnostics existants.
- [x] La suite build/typecheck/lint/test/bench reste verte après l’ajout de ces tests, et aucune dépendance à la coverage ou à des seeds non contrôlés n’est introduite dans les nouveaux scénarios.

Parent bullets couverts: [KR3, DEL3, DOD3, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
