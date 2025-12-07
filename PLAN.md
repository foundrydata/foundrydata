Task: 9600.9600002   Title: Implement deterministic metrics collection and SLI separation
Anchors: [spec://§15#metrics, spec://§15#rng, spec://§2#observability-surfaces]
Touched files:
- packages/core/src/util/metrics.ts
- packages/core/src/util/__tests__/metrics.test.ts
- packages/core/src/generator/foundry-generator.ts
- packages/core/src/pipeline/orchestrator.ts
- packages/core/src/pipeline/__tests__/metrics-observability.integration.test.ts

Approach:
Objectif: combler les écarts diag.metrics identifiés (branchTrialsTried absent, evalTraceChecks/Proved non collectés, repairActionsPerRow mal agrégé) tout en gardant l’observabilité passive (spec://§2#observability-surfaces) et déterministe (spec://§15#rng). (1) Étendre MetricsCollector avec des compteurs explicites pour evalTrace (checks/proved) et un accumulateur « actions par ligne » basé sur totaux + lignes, conserver enableSlis pour séparer SLIs non déterministes. (2) Instrumenter le générateur: enregistrer un branch trial à chaque sélection oneOf/anyOf, compter les consultations d’E-Trace (findEvaluationProof) et les preuves trouvées, sans influer sur le flux (metrics gating). (3) Mettre à jour le pipeline Repair pour passer le nombre d’items à l’agrégateur et produire une moyenne repairActionsPerRow stable. (4) Ajouter/mettre à jour les tests: unitaires sur MetricsCollector (evalTrace, moyenne actions/row), intégration pipeline couvrant branchTrialsTried + evalTraceCounters sur un schéma minimal avec metrics enable et determinism comparator qui ignore SLIs. Vérifier que les snapshots/reporters restent cohérents (payloads numériques uniquement). (5) Exécuter la chaîne build → typecheck → lint → test → bench; vérifier que les diags métriques restent conformes au schéma (spec://§15#metrics).

Risks/Unknowns:
- Scope branch trials: s’assurer que l’instrumentation couvre bien les sélection oneOf/anyOf sans double comptage (pas de branches retry loops cachées).
- E-Trace: comptage par appel findEvaluationProof peut sur-comptabiliser si la routine est appelée plusieurs fois pour le même nom; vérifier le comportement via tests d’intégration.
- repairActionsPerRow: moyenne globale basée sur actions totales/items peut diverger si d’autres appelants invoquent addRepairActions sans rowCount; couvrir via tests unitaires.

Parent bullets couverts: [KR1, KR2, DOD1, DOD2, TS1, TS2, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
