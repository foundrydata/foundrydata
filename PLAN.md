Task: 9601   Title: Validate coverage-report/v1 schema with observability fields
Anchors: [spec://§2#observability-surfaces, cov://§5#coverage-report, spec://§7#platform-kpis-gates]
Touched files:
- packages/reporter/src/schemas/coverage-report-v1.schema.json
- packages/reporter/test/coverage-report-schema.test.ts
- packages/core/src/coverage/runtime.ts
- packages/core/src/coverage/__tests__/coverage-report-json.test.ts

Approach:
Objectif: supprimer le trou où un rapport coverage-report/v1 peut déclarer operationsScope:'selected' sans lister selectedOperations, ce qui casse la comparabilité et l’audit des sélections (spec://§2#observability-surfaces, cov://§5#coverage-report, spec://§7#platform-kpis-gates). (1) Renforcer le JSON Schema avec une règle conditionnelle if/then pour exiger selectedOperations non vide dès que run.operationsScope vaut 'selected'; garder l’ouverture aux rapports legacy avec operationsScope absent ou 'all'. Ajouter des tests AJV positifs/négatifs pour documenter le comportement. (2) Durcir la normalisation runtime: si l’option coverage demande 'selected' mais aucune liste n’est fournie, rétrograder silencieusement à 'all' (observabilité passive, pas d’échec utilisateur) ; si une liste est fournie, continuer à dédupliquer/ordonner et émettre operationsScope:'selected' avec selectedOperations trié. Couvrir cela par un test d’intégration coverage-report-json. (3) Auto-review: pas de changement de sémantique pipeline, pas d’I/O ni RNG ajoutés; check que diff compatibility continue à rejeter les vrais mismatches et que les rapports émis respectent la nouvelle contrainte schema.

Risks/Unknowns:
- La rétrogradation à 'all' pourrait masquer une mauvaise configuration CLI; vérifier que ce fallback est acceptable vis-à-vis de la spec et n’introduit pas de faux positifs de comparabilité.
- S’assurer que les fixtures existantes (operationsScope absent) restent valides après la règle conditionnelle.

Parent bullets couverts: [KR1, KR3, KR4, DOD1, DOD2, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
