Task: 9333   Title: Harden CLI coverage profiles and coverage-report UX — subtask 9333.9333002
Anchors: [cov://§3#coverage-model, cov://§7#json-coverage-report]
Touched files:
- PLAN.md
- .taskmaster/docs/9333-traceability.md
- packages/cli/src/index.test.ts
- packages/cli/src/__tests__/coverage-summary.test.ts

Approach:
Pour la sous-tâche 9333.9333002, je vais aligner le résumé coverage CLI (stderr) sur coverage-report/v1 en le traitant comme une projection lisible des mêmes métriques et diagnostics (cov://§3#coverage-model, cov://§7#json-coverage-report). Concrètement : (1) m’appuyer sur les tests existants de `formatCoverageSummary` pour confirmer que la forme du résumé correspond à `metrics` et `diagnostics.plannerCapsHit`/`unsatisfiedHints` et, si besoin, les étendre pour couvrir targetsByStatus et les cas de caps/hints; (2) dans `packages/cli/src/index.test.ts`, ajouter des tests end-to-end pour `generate` et `openapi` en mode `coverage=measure` qui écrivent coverage-report/v1 sur disque via `--coverage-report`, capturent en parallèle les lignes de résumé sur stderr, rechargent le rapport JSON et comparent que les valeurs clés (overall, byDimension, byOperation, targetsByStatus, nombre de caps et d’unsatisfiedHints) sont reflétées dans le résumé; (3) veiller à ne pas changer le câblage runtime dans `index.ts` (qui appelle déjà `formatCoverageSummary(coverageReport)`), de sorte que la tâche reste centrée sur les tests et la vérification de conformité à la spec; (4) garder les fixtures de schéma petites pour maintenir des temps de test raisonnables tout en obtenant des métriques non triviales.

DoD:
- [x] Le résumé coverage CLI pour `generate` et `openapi` est testé comme projection fidèle de coverage-report/v1 (overall, byDimension, byOperation, targetsByStatus, caps, unsatisfiedHints) pour un petit schéma/OpenAPI.
- [x] Les tests de `formatCoverageSummary` couvrent explicitement l’alignement avec les champs metrics/diagnostics de coverage-report/v1.
- [x] build/typecheck/lint/test/bench OK.

Parent bullets couverts: [KR2, DEL2, DOD2, TS2]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
