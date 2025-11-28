Task: 9307   Title: Benchmark streaming coverage overhead (subtask 9307.9307004)
Anchors: [cov://§4#architecture-components, cov://§4#generator-instrumentation, cov://§8#technical-constraints-invariants]
Touched files:
- test/scripts/bench.test.ts
- .taskmaster/docs/9307-traceability.md
- PLAN.md

Approach:
Pour la sous-tâche 9307.9307004, je vais utiliser le bench harness existant (`scripts/bench-core.ts` + `scripts/bench.ts`) via les tests `test/scripts/bench.test.ts` pour mesurer explicitement le coût de la couverture streaming, en comparant des profils simples exécutés avec coverage=off et coverage=measure/guided dans le même cadre de seeds et de budgets (§8 Technical constraints & invariants). L’objectif est de vérifier que l’activation de la couverture streaming respecte les budgets p95LatencyMs/memoryPeakMB hérités de bench-profiles et reste dans l’ordre de grandeur attendu par la SPEC (O(#instances + #targets)), sans introduire de régression cachée.

Concrètement, je vais ajouter un test qui invoque `runProfile` sur le profil `simple` avec un override `pipelineOverrides.coverage` configuré en mode `measure` (dimensionsEnabled limitées à structure/branches) et un nombre réduit d’itérations, puis qui vérifie que le résumé de profil reste dans les BENCH_BUDGETS partagés et produit des métriques cohérentes. Ce test s’appuiera sur le même pipeline que le bench CLI (executePipeline + MetricsCollector en mode ci), ce qui garantit que l’overhead mesuré reflète bien l’implémentation streaming actuelle. Je garderai le bench CLI lui-même inchangé pour ne pas alourdir les exécutions par défaut, tout en documentant dans la traceability que des scénarios de bench dédiés à coverage=measure existent au niveau des tests.

Risks/Unknowns:
Le principal risque est de rendre le test de bench trop fragile vis-à-vis des fluctuations de performance environnementales (CI vs local), en particulier si on introduit des assertions trop serrées sur p50/p95. Pour limiter cela, je me contenterai de recycler les BENCH_BUDGETS déjà utilisés par le bench gate et d’exiger simplement que le profil coverage=measure reste sous ces seuils, sans imposer de ratio précis coverage=measure/coverage=off. Un autre risque est d’introduire une dépendance forte à coverage dans les scripts de bench CLI eux-mêmes; je garderai la mesure coverage=measure confinée au niveau des tests, de sorte que `npm run bench` reste stable et rapide tout en permettant d’allumer des scénarios coverage-aware ciblés via `vitest`. Enfin, je veillerai à ne pas multiplier les profils pour coverage afin de garder la durée des tests raisonnable (itérations réduites, profil simple uniquement).

Parent bullets couverts: [KR5, DOD4, DOD5, TS5]

SPEC-check: conforme aux anchors listés, pas d’écart identifié ; l’overhead de la couverture streaming est mesuré via le bench harness sur un profil simple en coverage=measure, et vérifié contre les mêmes BENCH_BUDGETS que le bench gate.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
