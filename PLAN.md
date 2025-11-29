Task: 9309   Title: Add boundaries coverage dimension and instrumentation (M2)
Anchors: [cov://§3#coverage-model, cov://§4#boundaries, spec://§8#numbers-multipleof]
Touched files:
- packages/core/src/generator/foundry-generator.ts
- packages/core/src/coverage/events.ts
- packages/core/src/coverage/__tests__/events.test.ts
- packages/core/src/generator/__tests__/coverage-branches-enum.test.ts
- .taskmaster/docs/9309-traceability.md

Approach:
For 9309.9309002, I will instrument the generator so that whenever emitted instances hit numeric, string or array boundary representatives, the coverage layer receives explicit `boundaries`-dimension events that can be matched to the `NUMERIC_*`, `STRING_*` et `ARRAY_*` targets déjà découverts par l’analyzer (cov://§3#coverage-model, cov://§4#boundaries). Je vais étendre le modèle d’événements de coverage avec des événements dédiés aux frontières dont l’identité est définie uniquement par `(dimension, kind, canonPath, params)`, en alignement avec la projection ID-stable existante, puis adapter les accumulateurs streaming et non-streaming pour qu’ils indexent aussi ces cibles sans ajouter de nouveaux parcours ni d’état global supplémentaire. Dans `foundry-generator`, j’identifierai les points où les valeurs numériques et les tailles de chaînes/tableaux sont choisies en suivant les règles de planification numérique existantes, y compris l’alignement sur `multipleOf` (spec://§8#numbers-multipleof), et, lorsqu’un accumulateur de coverage est présent et que la dimension `boundaries` est activée, j’émettrai des événements de frontières attachés au pointeur canonique et à la valeur représentative (ou longueur) plutôt qu’à une nouvelle logique de sélection. Cela garantit que les bornes inclusives sont comptées lorsqu’une valeur exactement égale est produite, que les bornes exclusives s’appuient sur la valeur représentative retenue par la planification numérique et que les cas dégénérés `min == max` (et équivalents pour longueurs/items) se traduisent en co-hit déterministes sans logique ad hoc côté générateur. Je complèterai avec des tests ciblés sur `createCoverageAccumulator` / `createStreamingCoverageAccumulator` et des événements synthétiques de frontières pour confirmer que les événements se résolvent vers les bons IDs de cibles et que le comportement des autres dimensions reste inchangé.

Risks/Unknowns:
- Aligner précisément les événements de frontières sur les valeurs effectivement émises par le générateur (surtout sous `multipleOf` et pour les bornes exclusives) dépend des décisions déjà prises dans la planification; cette sous-tâche doit rester strictement observatrice et éviter d’introduire une logique numérique concurrente.
- L’extension du modèle d’événements à la dimension `boundaries` doit rester compatible avec la sémantique existante des accumulateurs, y compris le cas `coverage=off` et les dimensions non activées; des tests ciblés sont nécessaires pour éviter des régressions silencieuses.
- L’instrumentation ne doit pas introduire de passes supplémentaires sur les données générées ni dégrader sensiblement les performances mesurées par les profils de bench; tout surcoût lié aux événements de frontières devra rester borné et sera réévalué lorsque les tests bout en bout de 9309.9309004 renforceront la validation de la dimension.

Parent bullets couverts: [KR2, KR3, KR5, DEL2, DOD3, TS2]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
