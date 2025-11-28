Task: 9302   Title: Add regression tests for coverage=off vs coverage=measure equivalence
Anchors: [cov://§3#coverage-model, cov://§3#dimensions, cov://§6#execution-modes]
Touched files:
- packages/core/src/pipeline/__tests__/pipeline-orchestrator.test.ts
- packages/core/test/e2e/pipeline.integration.spec.ts

Approach:
Pour cette sous-tâche, je vais ajouter des tests de régression qui comparent explicitement le comportement du pipeline en `coverage=off` et `coverage=measure`, conformément aux exigences de la SPEC sur M0 (cov://§3#coverage-model, cov://§6#execution-modes). L’idée est de faire tourner `executePipeline` sur une petite famille de schémas représentatifs (objets simples, schémas avec if/then/else et dependentSchemas) avec les mêmes options (seed, count, mode, validateFormats) en ne variant que `coverage.mode`. Les tests vérifieront que la séquence d’instances finales (après Repair) est byte‑for‑byte identique entre les deux modes, tout en s’assurant qu’en `coverage=measure` les artifacts de couverture (graph/targets) sont présents et que des targets de type `CONDITIONAL_PATH` ou `PROPERTY_PRESENT` sont marquées comme hit lorsque les chemins/propriétés correspondants sont effectivement exercés. Je concentrerai la logique de comparaison dans des helpers de test pour éviter la duplication, en utilisant les artefacts existants (`artifacts.generated`, `artifacts.repaired`, `artifacts.coverageTargets`) plutôt que de toucher à l’orchestrateur. Les tests e2e pipeline pourront couvrir un cas plus réaliste, alors que les tests unitaires sur `pipeline-orchestrator` resteront focalisés sur la forme des artefacts.

Risks/Unknowns:
Les risques principaux sont (1) l’introduction de tests trop fragiles (par exemple sensibles à des détails d’ordre non normatifs) alors que la SPEC demande un équivalence byte‑for‑byte sur les instances et non sur les structures internes, (2) la tentation de serrer les assertions sur les artefacts de couverture au‑delà de ce qui est garanti à ce stade (par exemple la forme exacte des IDs), et (3) le coût des tests e2e si on choisit des schémas trop lourds. Je limiterai donc les comparaisons à la séquence JSON d’instances (en normalisant via `JSON.stringify`) et à quelques invariants simples sur les coverageTargets (présence de hits pour certains canonPath/kind) pour rester robustes aux évolutions ultérieures de la couche coverage.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
