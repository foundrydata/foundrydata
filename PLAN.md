Task: 9601   Title: Fix coverage comparability metadata (subtask 9601.9601004)
Anchors: [spec://§2#observability-surfaces, spec://§7#platform-kpis-gates, cov://§5#coverage-report, cov://§7#thresholds]
Touched files:
- packages/core/src/pipeline/orchestrator.ts
- packages/core/src/coverage/runtime.ts
- packages/core/src/coverage/diff.ts
- packages/core/src/coverage/__tests__/coverage-diff.spec.ts
- packages/core/src/coverage/__tests__/coverage-report-json.test.ts
- packages/shared/src/types/coverage-report.ts
- packages/reporter/src/schemas/coverage-report-v1.schema.json
- packages/reporter/test/fixtures/coverage-report.v1.sample.json

Approach:
Objectif: corriger la propagation/normalisation de `run.operationsScope` et `run.selectedOperations` dans coverage-report/v1 pour que la comparabilité reflète vraiment le scope d’exécution (spec://§2#observability-surfaces, spec://§7#platform-kpis-gates, cov://§5#coverage-report). Étapes: (1) Remonter la valeur effective du scope opérations (all/selected + liste) depuis l’orchestrateur vers `runInfo` avant l’émission du rapport, en évitant tout side-effect pipeline (observabilité passive). (2) Normaliser `selectedOperations` (dédup + tri stable) au moment de l’émission pour garantir le déterminisme demandé par la spec, sans altérer les cibles ni le comportement de génération/validation. (3) Étendre la validation comparabilité (`checkCoverageDiffCompatibility`) pour s’assurer que la normalisation côté report est cohérente avec les checks existants (ops scope et fingerprint) et ajouter un test couvrant un rapport “selected” vs “all” pour vérifier le rejet, plus un test d’émission “selected” prouvant la présence des champs dans le rapport final. (4) Aligner schéma/fixture reporter (coverage-report-v1.schema.json + sample) et types partagés pour inclure les champs normalisés, en conservant la compatibilité avec les rapports legacy (registryFingerprint default '0', operationsScope undefined→'all'). (5) Boucler build → typecheck → lint → test → bench, et mettre à jour traceabilité si besoin. Aucun changement de sémantique coverage/planner; uniquement métadonnées et déterminisme.

Risks/Unknowns:
- La source exacte du scope opérations côté orchestrateur peut être absente dans certains chemins (non-OpenAPI); choisir une valeur par défaut déterministe ('all') sans masquer un scope restreint s’il est disponible.
- Normaliser/trier selectedOperations ne doit pas changer l’ordre attendu ailleurs; vérifier que les comparaisons utilisent l’ensemble, pas l’ordre d’origine.
- Tests existants de diff/CLI pourraient exiger l’ajout d’un nouveau fixture ou d’un cas “selected”; surveiller les snapshots.

Parent bullets couverts: [KR4, DEL3, DOD3, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
