Task: 9320   Title: Describe Node API access to coverage reports
Anchors: [cov://§1#context-goals, cov://§3#coverage-model, cov://§7#json-coverage-report]
Touched files:
- README.md
- .taskmaster/docs/9320-traceability.md

Approach:
Pour la sous-tâche 9320.9320003, je vais compléter la section “Node.js API” de `README.md` avec un paragraphe et un petit extrait de code montrant comment accéder au rapport de couverture depuis le Node API lorsque la couverture est activée. À partir de la SPEC coverage-aware (cov://§1#context-goals, cov://§3#coverage-model, cov://§7#json-coverage-report) et de l’API `Generate` existante (qui expose déjà une propriété `coverage?: Promise<CoverageReport | undefined>`), je documenterai un patron d’usage simple : activer la couverture via l’option `coverage` dans `Generate`, consommer les items via l’async iterable comme aujourd’hui, puis `await stream.coverage` pour récupérer un `CoverageReport` typé (avec `metrics.overall`, `metrics.byDimension`, `metrics.byOperation` quand disponible et `metrics.thresholds.overall` pour `minCoverage`). Je préciserai que, conformément à la SPEC, le rapport est déterministe pour un tuple `(schema, options, seed, ajvMajor, registryFingerprint)` donné, que `coverageStatus` reflète l’application éventuelle d’un seuil global `minCoverage`, et que `excludeUnreachable` affecte uniquement les dénominateurs sans retirer les cibles `status:'unreachable'` du rapport. Enfin, je veillerai à rester dans le périmètre Node API (sans redécrire la structure complète de coverage-report/v1) en renvoyant vers `docs/spec-coverage-aware-v1.0.md` pour les détails de schéma et vers la section CLI pour la configuration des flags correspondants.

Risks/Unknowns:
- Le principal risque est de suggérer une API Node côté couverture qui divergerait de l’implémentation réelle; je m’alignerai strictement sur `GenerateIterable.coverage` (promesse optionnelle de `CoverageReport`) sans inventer de nouveau façade et je clarifierai que cette propriété n’est renseignée que lorsque la couverture est activée.
- Il faudra trouver un équilibre entre la simplicité de l’exemple (boucle `for await` + `await stream.coverage`) et la nécessité de mentionner les champs clés du rapport (`coverageStatus`, `metrics.overall`, `metrics.thresholds.overall`, `metrics.byDimension` / `byOperation`) sans paraphraser toute la SPEC; en cas de doute, je renverrai explicitement à `docs/spec-coverage-aware-v1.0.md`.
- L’exemple Node doit rester compatible avec les tests existants (e2e coverage, `coverage-threshold.spec.ts`) et ne pas introduire de promesses implicites sur des comportements non garantis (par exemple des seuils par dimension qui ne sont pas encore normatifs en V1).

Parent bullets couverts: [KR3, DEL3, DOD3, DOD4, TS1]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
