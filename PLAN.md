Task: 9304   Title: Map CLI coverage options to core pipeline configuration (subtask 9304.9304002)
Anchors: [cov://§3#coverage-model, cov://§4#architecture-components, cov://§6#execution-modes-ux, cov://§6#budget-profiles, cov://§7#json-coverage-report]
Touched files:
- packages/cli/src/config/coverage-options.ts
- packages/cli/src/index.ts
- packages/cli/src/flags.ts
- packages/cli/src/index.test.ts

Approach:
Pour cette sous-tâche 9304.9304002, je vais introduire un module dédié `packages/cli/src/config/coverage-options.ts` chargé de transformer les flags CLI de couverture (`--coverage`, `--coverage-dimensions`, `--coverage-min`, `--coverage-report`, `--coverage-profile`, `--coverage-exclude-unreachable`) en configuration structurée pour le pipeline (`PipelineOptions.coverage` et options associées), en respectant les invariants du coverage model (cov://§3#coverage-model, cov://§4#architecture-components, cov://§6#execution-modes-ux). Ce module exposera une fonction de type `resolveCliCoverageOptions` qui prendra les options Commander (ou une vue typée `CliOptions`) et calculera : le `CoverageMode` effectif (`off|measure|guided`), la liste `dimensionsEnabled` (en filtrant ou rejetant les dimensions inconnues de façon déterministe), le booléen `excludeUnreachable` et la valeur `minCoverage` (seuil appliqué uniquement à `metrics.overall`, cov://§7#json-coverage-report), ainsi qu’un mapping clair entre `--n`/`--count` et `maxInstances` pour le mode guided au niveau de la couverture.

Dans `packages/cli/src/index.ts`, j’adapterai les appels à `Generate` (pour `generate` et `openapi`) pour injecter ces options coverage dans `executePipeline` via l’API core (en conservant l’invariant `coverage=off` ⇒ pas de CoverageAnalyzer ni d’instrumentation grâce à `shouldRunCoverageAnalyzer`). Je veillerai à ce que les combinaisons `coverage=off` + `--coverage-min` / `--coverage-report` soient gérées conformément à la description de la sous-tâche : les options minCoverage/coverage-report seront ignorées dans ce mode avec un message clair sur stderr, sans modifier les instances générées ni la sémantique de sortie. Enfin, je m’assurerai que les dimensions inconnues passées à `--coverage-dimensions` sont soit rejetées avec une erreur explicite (exit code non nul), soit filtrées avec un message déterministe, de manière à ne jamais perturber le calcul des métriques ou des seuils par rapport à `dimensionsEnabled`.

Risks/Unknowns:
Les principaux risques sont de mal synchroniser la configuration coverage CLI avec la configuration déjà en place dans le pipeline (options `PipelineOptions.coverage`, `CoverageHookOptions`, thresholds) et de violer les invariants de gating (par exemple en activant l’Analyzer alors que `coverage=off` ou en faisant dépendre `dimensionsEnabled` des caps de Compose). Il faudra également éviter d’altérer la stabilité du flux d’instances entre `coverage=off` et `coverage=measure` (cov://§6#execution-modes-ux) en vérifiant que la façon de passer les options coverage n’introduit ni nouvelle source d’aléa ni changement d’ordre dans les appels RNG. Enfin, la stratégie choisie pour les dimensions inconnues (erreur vs drop avec note) doit rester simple, déterministe et documentée dans les messages CLI pour éviter toute ambiguïté côté opérateur.

Parent bullets couverts: [KR2, KR4, KR5, DOD1, DOD2, DOD3, TS1, TS2, TS4]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
