Task: 9302   Title: Integrate coverage accumulators into pipeline orchestrator
Anchors: [cov://§3#coverage-model, cov://§3#dimensions, cov://§4#architecture-components]
Touched files:
- packages/core/src/pipeline/orchestrator.ts
- packages/core/src/pipeline/__tests__/pipeline-orchestrator.test.ts

Approach:
Pour cette sous-tâche, je vais intégrer les accumulateurs de couverture au niveau de l’orchestrateur de pipeline, en suivant le modèle de cibles et de dimensions décrit par la SPEC coverage-aware (cov://§3#coverage-model, cov://§3#dimensions) et l’architecture de la couche coverage (cov://§4#architecture-components). Après la phase Compose, lorsque coverage=measure (ou guided), l’orchestrateur utilisera les `CoverageTarget` construits par l’Analyzer pour initialiser un `CoverageAccumulator` unique pour le run courant. Pendant les phases Generate et Repair, le pipeline passera un hook `coverage` passif aux implémentations par défaut du générateur et du moteur de réparation, de sorte que les événements `CoverageEvent` émis par l’instrumentation (branches, enums, PROPERTY_PRESENT) soient simplement collectés dans une structure interne sans modifier le flux d’instances ni la RNG. Toute la couche coverage (Analyzer, accumulateur, hooks) restera strictement désactivée lorsque coverage=off, afin de respecter le gating fort coverage-aware. Après Validate, et uniquement si la validation finale n’a pas échoué, l’orchestrateur projettera les événements collectés sur l’univers de cibles via l’accumulateur pour produire des entrées `CoverageTargetReport` (internes) qui seront exposées via `artifacts.coverageTargets` avec des flags `hit` déterministes, sans impacter les artefacts existants ni les diagnostics.

Risks/Unknowns:
Les risques principaux concernent (1) le respect strict du gating coverage=off (aucune instrumentation ni Analyzer ne doivent être activés dans ce mode), (2) la garantie que coverage=measure ne perturbe pas le flux d’instances ni la RNG (déterminisme entre coverage=off et coverage=measure), et (3) la décision de ne valider les hits de couverture qu’après la phase Validate, en s’assurant que des instances invalides ne marquent jamais de cibles comme couvertes. Un autre point d’attention est l’impact sur les types et API publiques de `PipelineArtifacts` : l’ajout ou l’enrichissement de `coverageTargets` doit rester backward-compatible pour le reporter et les tests existants.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
