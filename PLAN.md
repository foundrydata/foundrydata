Task: 9306   Title: 9306.9306002 – Integrate hints into generator decision points
Anchors: [cov://§4#generator-instrumentation, cov://§5#hint-types, cov://§5#priority-conflict-resolution]
Touched files:
- packages/core/src/generator/foundry-generator.ts
- packages/core/src/generator/index.ts
- packages/core/src/generator/__tests__/generator-hints.spec.ts
- .taskmaster/docs/9306-traceability.md
- PLAN.md

Approach:
Pour la sous-tâche 9306.9306002, je vais intégrer la consommation des hints dans le générateur JSON Schema/OpenAPI en `coverage=guided`, en m’appuyant sur les types et règles de priorité définis dans la sous-tâche précédente. Concrètement, je vais étendre le `GenerationContext` pour porter une liste de hints par TestUnit, puis ajouter des helpers internes au module generator qui, pour un nœud donné (`canonPath`), filtrent les hints applicables, résolvent les conflits via `resolveCoverageHintConflicts` et exposent des décisions de haut niveau: branche à sélectionner (`preferBranch`), présence souhaitée d’une propriété (`ensurePropertyPresence`) et index d’énumération (`coverEnumValue`). Ces décisions ne seront appliquées que lorsque `coverage.mode === 'guided'` et uniquement sur les dimensions `branches`, `structure` et `enum`, en laissant AJV et les règles existantes décider en dernier ressort en cas de conflit ou d’impossibilité.

Du côté tests, je vais créer un fichier dédié `generator-hints.spec.ts` qui couvre des cas unitaires ciblés au niveau du générateur (sans passer par tout le pipeline): un schéma simple avec `oneOf`, un objet avec propriétés optionnelles et un `enum`. Pour chacun, je ferai tourner la génération avec et sans hints sous les mêmes seeds en `coverage=guided`, et j’asserterai que les hints pilotent bien la sélection de branche, la présence de propriété ou la valeur d’énum, tout en vérifiant que les modes `coverage=off` et `coverage=measure` restent inchangés (mêmes valeurs qu’avant). Les tests vérifieront aussi que, lorsque des hints sont inapplicables ou insatisfaisables, le générateur retombe sur les heuristiques existantes, sans modifier AP:false ni CoverageIndex et sans introduire de non-déterminisme supplémentaire.

Risks/Unknowns:
Les principaux risques sont : (1) altérer par erreur le comportement du générateur en `coverage=off` ou `coverage=measure` (ce qui serait contraire à la SPEC), (2) coupler trop fortement l’implémentation aux détails internes de la RNG ou d’AJV, et (3) effleurer des aspects relevant de la sous-tâche suivante (unsatisfiedHints, diagnostics) en sortant du scope. Pour les limiter, je vais encapsuler l’usage des hints derrière des helpers pures et ne les invoquer que lorsque `coverage.mode === 'guided'`, en gardant un chemin de code inchangé pour les autres modes. Je resterai aussi au niveau des décisions locales (branche/propriété/enum) sans instrumenter la remontée d’`unsatisfiedHints`, qui sera traitée plus tard.

Parent bullets couverts: [KR2, KR3, DEL2, DOD1, DOD2, TS2]

SPEC-check: conforme aux anchors listés, aucun écart identifié ; cette sous-tâche se limite à consommer les hints dans le générateur en mode guided sur branches/enum/propriétés, sans impacter AP:false, CoverageIndex ni la sémantique des autres modes de coverage, et en laissant la gestion des unsatisfiedHints aux sous-tâches ultérieures.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
