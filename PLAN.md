Task: 9604   Title: Wire operationsScope/selectedOperations into coverage report & derived view (subtask 9604.9604005)
Anchors: [spec://§2#observability-surfaces, spec://§7#platform-kpis-gates, cov://§5#coverage-report, cov://§7#thresholds, spec://§19#payloads]
Touched files:
- .taskmaster/docs/9604-traceability.md
- packages/reporter/test/fixtures/coverage-report.v1.sample.json
- packages/reporter/test/coverage-report-schema.test.ts
- packages/reporter/test/fixtures/reporter-platform-view.sample.json
- packages/reporter/src/platform-view/__tests__/platform-view.test.ts

Approach:
Objectif: refléter le scope réel des opérations OpenAPI dans coverage-report/v1 et la vue dérivée pour fiabiliser comparabilité/gates (`spec://§2#observability-surfaces`, `cov://§5#coverage-report`). (1) Mettre à jour le fixture coverage-report pour inclure un cas canonique `operationsScope:'selected'` + `selectedOperations` trié et un byOperation non vide, afin que la validation Ajv capture bien ces métadonnées et que les consommateurs disposent d’un exemple stable. (2) Adapter le test de schéma reporter pour valider ce fixture “selected” et continuer à rejeter les listes vides (cov://§7#thresholds), en conservant la compatibilité avec les rapports legacy. (3) Mettre à jour le fixture reporter-platform-view et, si besoin, le test du builder pour vérifier que la vue dérivée transporte `run.coverage.operationsScope/selectedOperations` normalisés sans changer la sémantique pipeline (observabilité passive, pas d’influence sur targets/actions). (4) Mettre à jour la trace 9604 (KR3/DEL1/DOD3/TS3) et boucler build → typecheck → lint → test → bench pour garantir qu’aucun comportement runtime n’est affecté. Aucun ajout de logique pipeline: uniquement données/validation/fixtures pour que les diffs/gates reflètent le scope sélectionné.

Risks/Unknowns:
- Normaliser/trier selectedOperations ne doit pas changer l’ordre attendu ailleurs; vérifier que les comparaisons se basent sur l’ensemble, pas l’ordre.
- Les fixtures modifiés peuvent impacter d’autres tests reporter; surveiller les snapshots implicites.
- byOperation ajouté doit rester cohérent avec coverageStatus pour éviter des assertions implicites.

Parent bullets couverts: [KR3, DEL1, DOD3, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
