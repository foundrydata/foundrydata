Task: 9604.9604002   Title: Add CI gate engine for observability KPIs — corrections
Anchors: [spec://§2#observability-surfaces, spec://§7#platform-kpis-gates, spec://§15#metrics, spec://§19#payloads, cov://§5#coverage-report]
Touched files:
- packages/reporter/src/gates/index.ts
- packages/reporter/src/gates/__tests__/gates.test.ts
- packages/reporter/src/platform-view/index.ts
- packages/reporter/src/engine/runner.ts
- packages/reporter/src/engine/report-builder.ts
- packages/reporter/src/cli.ts
- packages/reporter/test/fixtures/gates.trace.json
- packages/reporter/test/reporter-platform-view-schema.test.ts
- .taskmaster/docs/9604-traceability.md

Approach:
Objectif: combler les gaps identifiés sur 9604 (gates incomplets + vue dérivée non émise). (1) Étendre evaluateGates (spec://§7#platform-kpis-gates) pour traiter les invariants gValid “no-repair zone” via les compteurs `gValid_*` de diag.metrics et les diagnostics REPAIR_GVALID_STRUCTURAL_ACTION, et pour surface les caps planner/unplanned issus de coverage-report (cov://§5#coverage-report) avec sévérité fail si minCoverage est requis sinon warn. (2) Documenter les issues (codes + messages) et ajuster les fixtures/tests gates pour couvrir pass/warn/fail, gValid violations, caps/unplanned, warnAsFail, minCoverage absent/present, en maintenant l’ignorance explicite des SLIs (spec://§15#metrics). (3) Rendre la Reporter/Platform View effectivement produite: propager coverageReport + diag.metrics dans le runner et construire le platform-view (spec://§2#observability-surfaces, spec://§19#payloads) en sortie CLI `run` (fichier `.platform-view.json` aux côtés des reports) sans changer les artefacts source. (4) Mettre à jour la traceabilité 9604 pour refléter les nouveaux checks/gates et les tests correspondants. (5) Chaîne build → typecheck → lint → test → bench obligatoire; vérifier la schema validation platform-view.

Risks/Unknowns:
- Disponibilité du coverageReport dans tous les flux reporter: vérifier que runEngineOnSchema couvre bien measure/guided et reste passif si coverage absent.
- Sensibilité des gValid métriques: risque de faux positifs si certaines métriques sont toujours zéro; calibrer la sévérité (warn vs fail) pour respecter la spec sans casser des runs légitimes.

Parent bullets couverts: [KR4, DEL2, DEL3, DOD2, TS2, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
