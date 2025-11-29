Task: 9309   Title: Add boundaries coverage dimension and instrumentation (M2)
Anchors: [cov://§3#coverage-model, cov://§4#boundaries, cov://§7#json-coverage-report, spec://§8#numbers-multipleof]
Touched files:
- packages/core/src/coverage/__tests__/boundaries.spec.ts
- packages/core/src/pipeline/__tests__/pipeline-coverage-boundaries.integration.test.ts
- .taskmaster/docs/9309-traceability.md

Approach:
Pour 9309.9309004, je vais ajouter des tests ciblés qui valident les sémantiques de couverture de frontières de bout en bout: inclusif vs exclusif, cas dégénérés `min == max` et interactions avec `multipleOf`, en inspectant à la fois les hits de cibles `boundaries` et les métriques exposées dans le rapport de couverture (cov://§3#coverage-model, cov://§4#boundaries, cov://§7#json-coverage-report, spec://§8#numbers-multipleof). Dans `packages/core/src/coverage/__tests__/boundaries.spec.ts`, j’introduirai des tests unitaires qui exécutent l’analyzer et le générateur sur des petits schémas synthétiques (numérique, chaîne et tableau) via le pipeline ou des helpers internes, en contrôlant les valeurs émises pour vérifier que: (a) les bornes inclusives sont couvertes quand la valeur générée est exactement égale à la borne, (b) les bornes exclusives sont couvertes via la valeur représentative choisie par la planification numérique (y compris sous `multipleOf`), et (c) les cas `min == max` et `minLength == maxLength` / `minItems == maxItems` produisent des co-hit déterministes des cibles correspondantes. Je compléterai avec un test d’intégration dans `pipeline-coverage-boundaries.integration.test.ts` qui exécute `executePipeline` avec `coverage=guided` et `dimensionsEnabled` incluant `'boundaries'`, puis vérifie que `coverage.byDimension.boundaries` et `targets[]` reflètent les attentes manuelles sur un fixture mixte (incluant des bornes atteignables, des domaines vides déjà marqués `unreachable` par Compose et des combinaisons avec `multipleOf`). Les tests couvriront aussi un scénario où une valeur qui frappe une frontière et passe AJV reste inchangée par Repair en l’absence de contraintes supplémentaires, de sorte que les hits de frontières ne soient pas perdus inutilement.

Risks/Unknowns:
- Assurer que les tests restent déterministes malgré le RNG du générateur, en s’appuyant sur des seeds fixes et des schémas simples, est indispensable pour que les attentes sur les hits de frontières et les métriques by-dimension restent stables.
- Les scénarios impliquant `multipleOf` et bornes exclusives peuvent être sensibles aux détails de la planification numérique; les tests devront vérifier la cohérence des hits sans figer des valeurs trop spécifiques qui pourraient être ajustées par d’autres tâches liées aux nombres.
- L’intégration avec Repair pour le cas “boundary-hitting value unchanged” doit rester minimale dans cette sous-tâche (simple assertion de non-régression) afin de ne pas empiéter sur des ajustements de Repair potentiellement couverts par des tâches futures.

Parent bullets couverts: [DEL3, DOD1, DOD3, DOD4, TS2, TS4]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
