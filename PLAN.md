Task: 9334   Title: Define coverage-report/v1 JSON schema and compatibility guards — subtask 9334.9334002
Anchors: [cov://§3#coverage-model, cov://§7#json-coverage-report, cov://§10#acceptance-criteria-v1]
Touched files:
- packages/core/src/coverage/__tests__/coverage-report-json.test.ts
- packages/reporter/src/coverage/engine.ts
- .taskmaster/docs/9334-traceability.md

Approach:
Pour la sous-tâche 9334.9334002, je vais brancher le schéma JSON coverage-report/v1 dans les tests existants afin de valider les rapports réellement produits, en cohérence avec le contrat formalisé par la spec (cov://§3#coverage-model, cov://§7#json-coverage-report, cov://§10#acceptance-criteria-v1). Concrètement, je vais : (1) enrichir `coverage-report-json.test.ts` côté core pour charger le schéma `coverage-report-v1.schema.json` via AJV et valider les snapshots JSON déjà produits par les tests, de manière à couvrir au moins un rapport measure/guided; (2) si nécessaire, exposer une petite helper côté reporter (par ex. dans `coverage/engine.ts`) pour faciliter la validation des rapports générés par la CLI ou le reporter, sans introduire de dépendance inverse core → reporter. L’objectif est que tout changement incompatible de structure report soit détecté immédiatement par une validation de schéma dans les tests, tout en gardant les tests alignés sur les critères d’acceptance V1 (dimensionsEnabled, thresholds, coverageStatus, targets/uncoveredTargets cohérents).

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
