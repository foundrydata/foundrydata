Task: 9504   Title: Implement Repair tier classification and default tier policy — subtask 9504.9504002
Anchors: [spec://§10#repair-philosophy, spec://§10#mapping, spec://§6#generator-repair-contract, spec://§6#phases]
Touched files:
- PLAN.md
- .taskmaster/docs/9504-traceability.md
- .taskmaster/tasks/tasks.json
- packages/core/src/repair/tier-classification.ts
- packages/core/src/repair/repair-engine.ts
- packages/core/src/repair/__tests__/tier-classification.test.ts
- packages/core/src/repair/__tests__/mapping-repair.test.ts
- agent-log.jsonl

Approach:
Pour la sous-tâche 9504.9504002, je vais réutiliser le module de classification des tiers pour introduire une passerelle de policy `isActionAllowed(...)` qui combine le tier, la classification G_valid et l’ensemble `structuralKeywords` afin de décider si une action Repair donnée est autorisée dans le profil par défaut. En m’appuyant sur `spec://§10#repair-philosophy`, `spec://§10#mapping`, `spec://§6#generator-repair-contract` et `spec://§6#phases`, je vais (1) étendre `tier-classification.ts` avec une constante `STRUCTURAL_KEYWORDS` alignée sur la SPEC et une fonction pure `isActionAllowed({keyword,tier,inGValid,allowStructuralInGValid,maxTier})` qui encode la règle de policy par défaut (Tier0 toujours autorisé, Tier1 autorisé sauf mots-clés structurels en G_valid, Tier2 uniquement hors G_valid, Tier3 désactivé), (2) intégrer cette policy dans `repairItemsAjvDriven` en ajoutant un petit helper interne qui, pour chaque action mutante, normalise `canonPath`, récupère la classification G_valid via `gValidIndex`, applique `isActionAllowed` et, en cas de blocage, n’applique pas la mutation, n’ajoute pas d’`actions[]`, mais émet un diagnostic `REPAIR_TIER_DISABLED` avec `details.{keyword,requestedTier,allowedMaxTier,reason}` et incrémente les compteurs `addRepairTierDisabled`, (3) lorsque l’action est autorisée, compter systématiquement l’action via `addRepairTierAction(tier,1)` sans faire dépendre la décision de la coverage, et (4) compléter/adapter les tests dans `tier-classification.test.ts` et `mapping-repair.test.ts` pour vérifier la matrice {G_valid/non-G_valid} × {structural/non-structural} × {tier}, ainsi que la présence des diagnostics et des compteurs dans les cas bloqués, avant de rejouer build/typecheck/lint/test/bench.

DoD:
- [x] La fonction `isActionAllowed` encode le policy par défaut de §10 (Tier 0 toujours autorisé, Tier 1 limité en G_valid pour `structuralKeywords`, Tier 2 interdit en G_valid, Tier 3 désactivé) via un contrat pur et déterministe qui ne dépend ni de la coverage ni d’un état global.
- [x] `repairItemsAjvDriven` appelle la policy gate pour les actions mutantes représentatives (numeric bounds, string shape, array sizing, required, additionalProperties/unevaluatedProperties, multipleOf) en décidant de l’autorisation sur la base du tier, de la classification G_valid et de `structuralKeywords`, sans modifier l’ordre ou la sémantique de Repair dans les cas existants.
- [x] Les compteurs de métriques par tier sont incrémentés via la policy gate pour les actions autorisées, et la structure du diagnostic `REPAIR_TIER_DISABLED` est prête à être utilisée lorsque des profils ou motifs supplémentaires introduiront des blocages effectifs.
- [x] La suite build/typecheck/lint/test/bench reste verte après l’intégration de la policy gate et des tests dédiés dans `tier-classification.test.ts`, sans introduire de dépendance à l’état de coverage.

Parent bullets couverts: [KR2, DEL2, DOD2, TS2]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
