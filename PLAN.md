Task: 9401   Title: Design G_valid motif types and internal API — subtask 9401.9401001
Anchors: [spec://§6#generator-repair-contract, spec://§6#phases, spec://§9#generator]
Touched files:
- PLAN.md
- .taskmaster/docs/9401-traceability.md
- .taskmaster/tasks/tasks.json
- packages/core/src/transform/g-valid-classifier.ts
- packages/core/src/transform/__tests__/g-valid-motifs.spec.ts

Approach:
Pour la sous-tâche 9401.9401001, je vais introduire une représentation interne des motifs et de l’état G_valid qui servira de socle au classifieur et au wiring ultérieurs, en m’alignant sur la SPEC canonique (spec://§6#generator-repair-contract, spec://§6#phases, spec://§9#generator) sans implémenter encore la logique de classification complète. Concrètement : (1) définir dans `g-valid-classifier.ts` un enum ou union discriminée de motifs (par exemple `simpleObjectRequired`, `arrayItemsContainsSimple`, `apFalseMustCover`, `complexContains`, etc.) associé à un type de résultat `GValidInfo` incluant un booléen `isGValid` et le motif éventuel; (2) exposer une API interne minimale (par exemple `classifyGValidPlaceholder` ou des helpers de forme `makeGValidInfoNone/motif`) qui pourra être remplie par la sous-tâche 9401.9401002 sans changer les signatures utilisées par Generate/Repair/metrics; (3) ajouter un fichier de test `g-valid-motifs.spec.ts` qui valide au moins la stabilité des types (création explicite de quelques valeurs `GValidInfo` et vérification de leur forme) et prépare le terrain pour les tests de classification réels à venir, tout en respectant la séparation de périmètre (pas de logique de Compose/coverage ici); (4) mettre à jour la traçabilité 9401 pour relier cette sous-tâche aux bullets KR1 (motif enum/API), DEL1 et à la partie type/contrat de TS1, en considérant l’implémentation du classifieur et les tests de bout en bout comme hors scope.

DoD:
- [ ] Un type Motif/G_valid interne est défini et stable (enum/union + structure GValidInfo) dans `g-valid-classifier.ts`, cohérent avec les motifs G_valid v1 décrits par la SPEC.
- [ ] Une API interne simple (helpers ou factory) est disponible pour consommer/produire des `GValidInfo` sans implémenter encore la classification sur Compose.
- [ ] build/typecheck/lint/test/bench OK.

Parent bullets couverts: [KR1, DEL1, TS1]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
