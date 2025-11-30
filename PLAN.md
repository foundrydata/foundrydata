Task: 9334   Title: Define coverage-report/v1 JSON schema and compatibility guards — subtask 9334.9334002
Anchors: [cov://§3#coverage-model, cov://§7#json-coverage-report, cov://§10#acceptance-criteria-v1]
Touched files:
- packages/reporter/src/schemas/coverage-report-v1.schema.json
- packages/reporter/test/coverage-report-schema.test.ts
- packages/reporter/test/fixtures/coverage-report.v1.sample.json
- .taskmaster/docs/9334-traceability.md

Approach:
Pour la sous-tâche 9334.9334002, je branche le schéma JSON coverage-report/v1 dans la couche reporter afin de valider des rapports réels contre le contrat formalisé par la spec (cov://§3#coverage-model, cov://§7#json-coverage-report, cov://§10#acceptance-criteria-v1). Concrètement, j’ai : (1) introduit un test dédié `packages/reporter/test/coverage-report-schema.test.ts` qui charge `coverage-report-v1.schema.json` via Ajv 2020-12 et applique `ajv-formats`, puis valide une fixture stable `coverage-report.v1.sample.json` représentant un rapport minimal mais complet; (2) aligné la fixture sur les types `CoverageReport` partagés (`@foundrydata/shared`) pour couvrir version/reportMode, en-têtes engine/run, métriques, cibles, hints et diagnostics, en respectant les invariants coverage-aware sans coupler les tests core ↔ reporter. L’objectif est que tout changement incompatible dans la forme du rapport soit détecté immédiatement par ce test AJV, tout en laissant le schéma suffisamment extensible pour les diagnostics additionnels.

Risks/Unknowns:
- Introduire AJV dans les tests coverage (via reporter ou directement) ajoute un point de défaillance supplémentaire; il faudra veiller à ne pas rendre les tests trop couplés à la version précise du schéma en laissant une marge d’extension dans celui-ci.
- Certains rapports utilisés dans les tests peuvent contenir des champs additionnels (notes, diagnostics spécifiques) non explicitement décrits par la spec; je devrai m’assurer que le schéma reste permissif sur ces extensions pour éviter des faux positifs.
- Il faudra garder les tests de validation de schéma ciblés (sur quelques fixtures représentatives) afin de ne pas alourdir excessivement le temps d’exécution global de la suite.

Parent bullets couverts: [KR2, DEL2, DOD2, TS2]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
