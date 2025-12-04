Task: 9506   Title: Add micro-schemas + E2E assertions for tier behavior, G_valid regressions, and UNSAT stability — subtask 9506.9506003
Anchors: [spec://§10#repair-philosophy, spec://§10#mapping, spec://§6#generator-repair-contract, spec://§15#metrics, spec://§15#rng]
Touched files:
- PLAN.md
- .taskmaster/docs/9506-traceability.md
- .taskmaster/tasks/tasks.json
- packages/core/src/pipeline/__tests__/repair-unsat-stagnation.integration.test.ts
- agent-log.jsonl

Approach:
Pour la sous-tâche 9506.9506003, je vais ajouter un test E2E pipeline qui exploite le micro-schema UNSAT/stagnation de `repair-philosophy-microschemas` afin d’observer la stagnation de Score(x) et le comportement d’UNSAT/budget sans changer la sémantique de Repair. En m’appuyant sur `spec://§10#repair-philosophy`, `spec://§10#mapping`, `spec://§6#generator-repair-contract`, `spec://§15#metrics` et `spec://§15#rng`, je vais (1) créer un fichier `repair-unsat-stagnation.integration.test.ts` qui exécute `executePipeline` sur le motif UNSAT (par exemple `integerConstVsMultipleOf`) avec un nombre d’instances limité et des options de plan `repair` (bailOnUnsatAfter) resserrées pour forcer un budget rapide, (2) vérifier que le pipeline reste stable pour un tuple (schema, options, seed) donné, que les artefacts Repair (items/actions/diagnostics) sont reproductibles entre runs et que les métriques de Repair (`repairPassesPerRow`, `repairActionsPerRow`, compteurs de tiers) sont cohérentes, (3) observer, via diagnostics existants ou métriques, que le scénario correspond bien à un cas de stagnation/UNSAT (Score ne diminue pas strictement et le budget est atteint) sans introduire de nouveaux codes, et (4) rejouer build/typecheck/lint/test/bench pour s’assurer que ce test d’UNSAT/stagnation ne rend pas la suite fragile et qu’il reste compatible avec les invariants de la spec sur le déterminisme.

DoD:
- [x] Un test pipeline UNSAT/stagnation consomme le micro-schema UNSAT/stagnation des fixtures et démontre qu’aucune séquence de Repair ne permet d’atteindre un état pleinement valide pour un tuple (schema, options, seed) fixé, tout en restant déterministe.
- [x] Les diagnostics et métriques observés pour ce scénario restent compatibles avec les enveloppes existantes (pas de nouveaux codes introduits), et rendent visibles les informations de type Score/budget ou stagnation prévues par la spec.
- [x] Les métriques Repair pertinentes (`repairPassesPerRow`, `repairActionsPerRow` et compteurs de tiers) restent cohérentes entre plusieurs runs identiques, montrant que le traitement UNSAT/stagnation n’introduit pas de non-déterminisme caché.
- [x] La suite build/typecheck/lint/test/bench reste verte avec ce test d’UNSAT/stagnation, et la trace 9506 est mise à jour pour refléter la couverture de DEL3/DOD3/TS3.

Parent bullets couverts: [DEL3, DOD3, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
