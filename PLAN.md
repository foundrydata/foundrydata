Task: 9600   Title: Align diag.metrics baseline with observability spec — subtask 9600.9600001
Anchors: [spec://§2#observability-surfaces, spec://§15#metrics, spec://§19#envelope]
Touched files:
- PLAN.md
- .taskmaster/docs/9600-traceability.md
- packages/shared/src/types/diag.metrics.ts
- packages/shared/src/index.ts
- packages/core/src/util/metrics.ts
- packages/core/src/diag/validate.ts
- packages/reporter/src/model/report.ts

Approach:
Pour la sous-tâche 9600.9600001, je vais aligner le modèle `diag.metrics` sur la baseline SPEC en introduisant un type partagé qui rassemble les timings par phase, les compteurs déterministes (validationsPerRow, repairPassesPerRow, branchTrialsTried, patternWitnessTried, evalTraceChecks/proved, actions par tiers) et les SLIs de bench (p50/p95LatencyMs, memoryPeakMB). En m’appuyant sur `spec://§2#observability-surfaces`, `spec://§15#metrics` et `spec://§19#envelope`, je commencerai par créer `.taskmaster/docs/9600-traceability.md` pour tracer les bullets parent, puis j’ajouterai `packages/shared/src/types/diag.metrics.ts` et l’exporterai afin que core et reporter partagent la même source de vérité. Dans core, j’alignerai `MetricsSnapshot` sur ce type (ajout/validation des champs manquants éventuels) et mettrai à jour les valeurs par défaut pour garantir une présence cohérente (0 ou undefined selon le mode metrics). Je renforcerai `DiagnosticMetrics` et son validateur pour accepter cette forme structurée (y compris les compteurs tiers) tout en gardant les SLIs numériques et en rejetant toute valeur non numérique. Enfin, j’adapterai le reporter à ces nouveaux types afin que les snapshots de metrics restent compatibles et déterministes, en veillant à ne pas introduire de charges supplémentaires en mode runtime. Je conclurai par un passage build → typecheck → lint → test → bench et une validation rapide du schéma diag.

Risks/Unknowns:
- Potentiel écart entre la nouvelle forme partagée et des usages implicites (ex. metrics options partiellement remplies) pouvant casser des tests existants.
- Arbitrage “0 vs undefined” pour les SLIs et timings en mode metrics désactivé : il faudra respecter la convention actuelle pour éviter des diffs d’instantanés.
- S’assurer que le validateur diag n’interdit pas des champs additionnels légers (ex. repairUsageByMotif) tout en restant strict sur les nombres.

Parent bullets couverts: [KR1, DEL1, DOD1, TS1]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
