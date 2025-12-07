Task: 9601.9601005   Title: Enforce coverage diff compatibility for coverage settings
Anchors: [spec://§2#observability-surfaces, spec://§7#platform-kpis-gates, cov://§5#coverage-report]
Touched files:
- packages/core/src/coverage/diff.ts
- packages/core/src/coverage/__tests__/coverage-diff.spec.ts

Approach:
Nous devons aligner `checkCoverageDiffCompatibility` et le CLI diff avec la spec comparabilité: un diff ne doit pas être produit si les runs n’ont pas les mêmes `dimensionsEnabled` ou `excludeUnreachable`. (1) Étendre le compat-check pour comparer ces deux options au même titre que version/engine/operationsScope/registryFingerprint, en gardant l’observabilité passive (pas de changement d’outputs coverage). (2) Ajouter des tests unitaires core de compatibilité qui couvrent les cas mismatch (dimensions supplémentaires dans B, permutations, excludeUnreachable différent) et s’assurent que les cas compatibles restent acceptés (ordre stable, ensembles identiques). (3) Vérifier l’effet sur la commande CLI coverage diff: aucun changement de comportement si les rapports sont compatibles, mais l’erreur doit remonter dès qu’un mismatch coverage settings est détecté; ajuster ou ajouter un test ciblé si nécessaire pour figer le message. (4) Conserver les invariants existants (operationsScope/selectedOperations, registryFingerprint) et éviter tout recalcul de métriques pour des rapports incompatibles. Chaîne build → typecheck → lint → test → bench obligatoire.

Risks/Unknowns:
- Les rapports legacy peuvent manquer `dimensionsEnabled` ou `excludeUnreachable`; il faut décider si l’on traite les valeurs absentes comme incompatibles ou si l’on normalise vers les defaults (préférence: incompatibles, mais vérifier l’impact sur les fixtures existantes).
- Les messages d’erreur CLI doivent rester stables; ajuster les assertions pour éviter la fragilité aux changements de wording.

Parent bullets couverts: [KR4, DEL3, DOD3, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
