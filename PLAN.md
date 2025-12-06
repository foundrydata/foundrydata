Task: 9600   Title: Align diag.metrics baseline with observability spec — subtask 9600.9600002
Anchors: [spec://§2#observability-surfaces, spec://§15#metrics, spec://§15#rng, spec://§19#envelope]
Touched files:
- PLAN.md
- .taskmaster/docs/9600-traceability.md
- packages/core/src/util/metrics.ts
- packages/core/src/util/__tests__/metrics.test.ts
- scripts/bench-core.ts
- packages/reporter/src/model/report.ts (if propagation/typing updates are needed)

Approach:
Pour la sous-tâche 9600.9600002, je dois rendre la collecte de métriques déterministe pour un tuple fixe (schema/options/seed) et isoler les SLIs dépendantes de l’environnement (p50/p95/memory) au seul bench harness. En m’appuyant sur `spec://§2#observability-surfaces`, `spec://§15#metrics`, `spec://§15#rng` et `spec://§19#envelope`, je vais (1) introduire un flag explicite `enableSlis`/verbosité pour le `MetricsCollector` afin que les appels `setLatency`/`observeMemoryPeak` soient no-op en mode runtime (metrics off ou non-bench) tout en restant disponibles pour le bench (ci), (2) garantir que les timers utilisent uniquement l’horloge monotone et clampent les durées négatives ou NaN à 0 pour éviter tout bruit non déterministe, (3) s’assurer que le snapshot en mode metrics désactivé reste cohérent (zéros stables, pas de mutation des structures optionnelles) et que la propagation pipeline → diag → reporter n’introduit pas de dépendance aux SLIs lorsqu’elles sont coupées, et (4) renforcer les tests unitaires du collector avec un faux clock/verbosity pour couvrir ces chemins (SLIs ignorées en runtime, prises en compte en ci) tout en vérifiant que les compteurs déterministes restent accumulés et stables. J’ajusterai le bench harness pour activer explicitement les SLIs et vérifierai qu’aucun code pipeline ne s’appuie sur ces valeurs pour le contrôle de flux. Je clôturerai avec build → typecheck → lint → test → bench et une validation rapide du schéma diag/metrics.

Risks/Unknowns:
- Hypothèse que personne n’utilise aujourd’hui les SLIs en mode runtime ; si des tests les attendent, il faudra adapter le flag plutôt que supprimer silencieusement des valeurs.
- Risque de coupler la verbosité ci/runtime et l’activation SLIs : bien séparer “collecte” (enabled) et “SLI” (enableSlis) pour éviter des régressions.
- Pipeline/orchestrator ne devrait pas dépendre des SLIs (contrat SPEC), mais vérifier qu’aucune logique de diag ne s’en sert (sinon, documenter et geler).

Parent bullets couverts: [KR1, KR2, DEL1, DEL2, DOD1, DOD2, TS1]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
