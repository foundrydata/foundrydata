Task: 9306   Title: 9306.9306001 – Define hint types and priority rules
Anchors: [cov://§5#hint-types, cov://§5#priority-conflict-resolution]
Touched files:
- packages/core/src/coverage/coverage-planner.ts
- packages/core/src/coverage/__tests__/coverage-planner.test.ts
- packages/core/src/coverage/index.ts
- .taskmaster/docs/9306-traceability.md
- PLAN.md

Approach:
Pour la sous-tâche 9306.9306001, je vais consolider la définition des hints de coverage côté core en alignant les types `preferBranch`, `ensurePropertyPresence` et `coverEnumValue` avec la SPEC, puis en introduisant des règles explicites de priorité et de résolution de conflits entre ces hints. Concrètement, je vais factoriser la définition des types de hints et de leur discriminant `kind` dans `coverage-planner.ts`, ajouter une structure d’ordre global documentée (par exemple un tableau de priorité ou un mapping) qui encode `coverEnumValue > preferBranch > ensurePropertyPresence`, et fournir de petits helpers purs pour exposer cette priorité au générateur sans introduire de dépendance au pipeline ni à AJV. Je veillerai aussi à ce que la représentation des hints reste suffisamment générale pour être réutilisée par le Planner et par la génération, en préservant la forme actuelle des TestUnits.

Du côté des tests, je vais enrichir `coverage-planner.test.ts` avec des cas ciblés qui valident la fonction de validation `isCoverageHint` sur les nouveaux invariants éventuels et qui vérifient que la priorité par kind et l’ordre stable “first in hints[] wins” sont respectés pour un ensemble de hints artificiels attachés à un même `canonPath`. Ces tests resteront purement fonctionnels et déterministes (aucun RNG, pas d’appel à la pipeline), et viseront une couverture élevée de la logique de priorité sans anticiper l’implémentation exacte de la consommation des hints par le générateur, qui sera traitée dans les sous-tâches suivantes. Enfin, je mettrai à jour la traçabilité 9306 pour rattacher cette sous-tâche aux bullets “hint types” et “priority rules”.

Risks/Unknowns:
Les principaux risques sont : (1) sur-spécifier la forme des hints ou de leur ordre au point de rigidifier inutilement les futurs usages côté générateur ou Repair, et (2) introduire par inadvertance une dépendance implicite à l’ordre de tri ou à d’autres heuristiques non décrites par la SPEC. Pour limiter cela, je vais garder les helpers de priorité minimaux (ordre global + stabilité intra-kind) et laisser la logique d’application concrète aux sous-tâches suivantes. Autre inconnue : certains aspects de la représentation finale des `unsatisfiedHints` seront précisés plus loin ; je m’assurerai que la modélisation actuelle des hints n’entrave pas cette extension.

Parent bullets couverts: [KR1, KR3, DEL1, TS1]

SPEC-check: conforme aux anchors listés, aucun écart identifié ; cette sous-tâche se limite à formaliser les types de hints et leur ordre de priorité global, sans activer la consommation des hints dans le générateur ni la gestion des unsatisfiedHints, qui restent hors scope ici.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
