Task: 9401   Title: Implement classifier over Compose artifacts — subtask 9401.9401002
Anchors: [spec://§6#generator-repair-contract, spec://§6#phases, spec://§6#generator-repair-contract, spec://§9#generator, spec://§8#compose]
Touched files:
- PLAN.md
- .taskmaster/docs/9401-traceability.md
- .taskmaster/tasks/tasks.json
- packages/core/src/transform/g-valid-classifier.ts
- packages/core/src/transform/__tests__/g-valid-classifier.spec.ts

Approach:
Pour la sous-tâche 9401.9401002, je vais implémenter un premier classifieur G_valid dans `g-valid-classifier.ts` qui s’appuie sur le schéma canonique et les artefacts de Compose (CoverageIndex, diagnostics) pour marquer certains `canonPath` comme G_valid v1 ou non, en respectant strictement les conditions de la SPEC (spec://§6#generator-repair-contract, spec://§6#phases, spec://§8#compose, spec://§9#generator). Concrètement : (1) ajouter une fonction `classifyGValid` qui accepte le schéma canonique, un `CoverageIndex` et (optionnellement) les diagnostics de Compose, et qui parcourt la structure canonique pour identifier les motifs de base G_valid v1 (objets simples avec `required`/`minProperties` sans AP:false/unevaluated*, arrays simples `items`+`contains` sans `uniqueItems` ni bags complexes) en marquant tous les autres chemins comme non-G_valid; (2) utiliser `CoverageIndex` et, le cas échéant, les diagnostics de Compose pour détecter les cas explicitement exclus par la SPEC (AP:false must-cover, `CONTAINS_UNSAT_BY_SUM` et motifs complexes) afin de ne jamais les classer G_valid; (3) écrire un fichier de test dédié `g-valid-classifier.spec.ts` qui alimente le classifieur avec quelques micro-schémas canoniques et des CoverageIndex synthétiques et vérifie que les chemins attendus sont marqués G_valid ou non conformément aux motifs de §6.3, sans encore câbler l’API dans Generate/Repair; (4) garder l’algorithme conservateur (préférer ne pas classer un chemin en G_valid plutôt que de le sur-classer) pour rester compatible avec le contrat et laisser 9401.9401003/9401.9401004 enrichir et durcir la couverture de tests.

DoD:
- [x] `classifyGValid` produit un index de classification par `canonPath` avec au moins les motifs v1 de base (simple object required, array items+contains simple) marqués G_valid lorsque les conditions de la SPEC sont clairement satisfaites.
- [x] Les tests unitaires couvrent des cas positifs et négatifs pour ces motifs, ainsi que des exclusions simples (AP:false/unevaluated*/contains complexes) à partir de schémas de micro-fixtures.
- [x] build/typecheck/lint/test/bench OK.

Parent bullets couverts: [KR1, KR2, KR3, DEL1, DEL3, DOD1, DOD2, TS1, TS2, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
