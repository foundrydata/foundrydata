Task: 9334   Title: Define coverage-report/v1 JSON schema and compatibility guards — subtask 9334.9334003
Anchors: [cov://§3#coverage-model, cov://§7#json-coverage-report, cov://§10#acceptance-criteria-v1]
Touched files:
- packages/core/src/coverage/__tests__/coverage-diff.spec.ts
- packages/reporter/src/coverage/__tests__/coverage-diff.spec.ts
- .taskmaster/docs/9334-traceability.md

Approach:
Pour la sous-tâche 9334.9334003, je vais étendre les tests de compatibilité diff afin de garantir que les évolutions du contrat coverage-report/v1 restent rétro-compatibles et que les incompatibilités sont signalées explicitement, en cohérence avec la spec (cov://§3#coverage-model, cov://§7#json-coverage-report, cov://§10#acceptance-criteria-v1). Concrètement, je vais : (1) ajouter des fixtures/constructeurs de rapports « anciens » vs « nouveaux » dans les tests core `coverage-diff.spec.ts` pour couvrir des scénarios où des champs optionnels sont absents d’un côté (par exemple `operationsScope`, `selectedOperations`, nouveaux champs de diagnostics) et vérifier que `checkCoverageDiffCompatibility` considère ces cas comme compatibles; (2) compléter les tests reporter `coverage-diff.spec.ts` pour couvrir les chemins où la commande de diff consomme des rapports acceptables mais non strictement identiques (dimensions activées, champs additionnels) et s’assurer que les résumés et les issues de compatibilité restent stables et déterministes. L’objectif est que toute divergence réellement incompatible (version, engine major, opérationsScope réellement incompatibles) soit détectée, tandis que les ajouts non critiques restent transparents pour les consommateurs.

Risks/Unknowns:
- Il faudra veiller à ne pas sur-contraindre `checkCoverageDiffCompatibility` : certains deltas attendus (par exemple changements de dimensionsEnabled ou ajout de cibles dans de nouvelles dimensions) doivent rester compatibles tout en étant reflétés dans le diff.
- Les tests devront rester indépendants du détail complet du schéma JSON (déjà couvert par 9334.9334001/002) et se concentrer sur le comportement de compatibilité/diff, au risque sinon de dédoubler la responsabilité.
- Il faudra couvrir suffisamment de cas pour refléter les scénarios décrits dans la spec (versions identiques vs différentes, operationsScope, ajouts de champs), sans alourdir excessivement la suite de tests.

Parent bullets couverts: [KR3, DEL3, DOD3, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
