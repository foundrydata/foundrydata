Task: 9306   Title: 9306.9306004 – Add tests for hint precedence and determinism
Anchors: [cov://§5#priority-conflict-resolution, cov://§6#execution-modes-ux]
Touched files:
- packages/core/src/generator/foundry-generator.ts
- packages/core/src/coverage/coverage-planner.ts
- packages/core/src/coverage/__tests__/coverage-planner.test.ts
- packages/core/src/generator/__tests__/generator-hints.spec.ts
- .taskmaster/docs/9306-traceability.md
- PLAN.md

Approach:
Pour la sous-tâche 9306.9306004, je vais renforcer les tests autour des règles de priorité et de déterminisme des hints, en couvrant à la fois le niveau planner (résolution de conflits entre hints) et le niveau générateur (effet observable sur les instances en coverage=guided). Côté planner, je compléterai les tests de `resolveCoverageHintConflicts` pour valider, sur un ensemble plus riche de hints, que l’ordre global `coverEnumValue > preferBranch > ensurePropertyPresence` est bien respecté et que l’ordre “first in hints[] wins” est stable à l’intérieur de chaque kind. Côté générateur, j’ajouterai des tests qui comparent plusieurs runs avec les mêmes hints (et seeds) pour vérifier que les résultats sont deterministes, et des cas avec plusieurs hints de kinds différents sur le même nœud pour vérifier que la priorité par kind est bien appliquée.

Du point de vue des tests, je resterai sur des schémas très simples (oneOf, anyOf, enums, propriétés optionnelles) et j’utiliserai des callbacks (par exemple `recordUnsatisfiedHint`) et les artefacts de génération pour observer le comportement, sans dépendre de l’orchestrateur complet. Les tests vérifieront que, pour un tuple `(schema, hints, options, seed)` donné, deux exécutions donnent les mêmes instances et la même séquence de décisions observables (par exemple valeur enum ciblée), et que la permutation de hints à l’intérieur d’un même kind ne casse pas la règle “first in hints[] wins” documentée. Je veillerai à ne pas étendre la surface fonctionnelle (pas de nouveaux codes de diagnostics) et à garder ces tests robustes vis-à-vis d’optimisations futures tout en documentant clairement, par assertions, les invariants de priorité et de déterminisme attendus.

Risks/Unknowns:
Les risques principaux sont : (1) écrire des tests trop couplés à des détails internes (par exemple structure exacte des diagnostics ou ordres d’itération non spécifiés) qui deviendraient fragiles à la moindre optimisation, (2) tester des comportements qui relèvent en réalité d’autres sous-tâches (comme l’intégration complète d’unsatisfiedHints dans le rapport) et donc élargir le scope, et (3) introduire par inadvertance des sources de nondéterminisme dans les tests eux-mêmes. Pour les éviter, je vais me concentrer sur des invariants déclarés par la SPEC (ordre global des kinds, first-in-wins, stabilité des runs pour un seed fixé) et m’assurer que les assertions portent sur ces invariants et sur des sorties simples (valeurs générées, choix de branches, hints effectifs) plutôt que sur des structures de données internes.

Parent bullets couverts: [KR3, KR5, DOD4, TS2]

SPEC-check: conforme aux anchors listés, aucun écart identifié ; cette sous-tâche se limite à documenter, via des tests unitaires et de petit intégration, la priorité et le déterminisme des hints déjà implémentés, sans toucher à la sémantique du générateur ou du rapport de couverture.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
