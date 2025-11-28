Task: 9307   Title: Implement per-instance coverage state and bitmap representation (subtask 9307.9307001)
Anchors: [cov://§4#architecture-components, cov://§4#generator-instrumentation, cov://§8#technical-constraints-invariants]
Touched files:
- packages/core/src/coverage/events.ts
- packages/core/src/coverage/__tests__/events.test.ts
- packages/core/src/coverage/index.ts
- .taskmaster/docs/9307-traceability.md
- PLAN.md

Approach:
Pour la sous-tâche 9307.9307001, je vais introduire dans le module coverage de @foundrydata/core une représentation explicite de l’état de couverture par instance, ainsi qu’un bitmap global de cibles atteintes, en réutilisant l’indexage existant entre CoverageEvents et CoverageTargets. L’objectif est de séparer clairement la collecte d’événements pour une instance donnée de la consolidation globale, afin de pouvoir abandonner ou valider une instance sans perturber les hits déjà engagés, tout en restant strictement en O(#instances + #targets) comme décrit dans cov://§4#architecture-components, cov://§4#generator-instrumentation et cov://§8#technical-constraints-invariants.

Concrètement, je vais factoriser la logique d’identification de cibles dans `events.ts` pour exposer un petit index (clé d’identité → targetId) partagé entre l’accumulateur existant et les nouveaux états par instance. Je définirai un type d’état par instance qui accumule des hits dans un ensemble dédié, plus un accumulateur “streaming” qui agrège ces états via une opération de commit explicite et expose toujours l’API actuelle (markTargetHit, isHit, toReport) pour ne pas casser les usages en place. Les tests `events.test.ts` seront étendus pour couvrir à la fois les scénarios existants (mapping structure/branches/enum, cibles diagnostiques ignorées) et des scénarios de streaming simples : plusieurs instances dont certaines sont rejetées, vérification que seuls les commits acceptés impactent le bitmap global, déterminisme des résultats pour une même séquence d’événements.

Risks/Unknowns:
Le principal risque est de complexifier inutilement l’API de coverage ou de préjuger d’intégrations futures dans le pipeline (sous-tâche 9307.9307002). Pour limiter cela, je garderai `createCoverageAccumulator` disponible et je structurerai les nouveaux types de manière additive, sans modifier la signature publique des fonctions utilisées par le pipeline. Un autre point d’attention est la consommation mémoire : l’état par instance doit rester léger et ne pas dupliquer la liste complète des cibles à chaque fois. Je privilégierai donc des ensembles d’identifiants dérivés de l’index partagé plutôt que des structures riches. Enfin, il faudra s’assurer que les nouvelles structures respectent les invariants de déterminisme (pas de RNG, pas d’état global caché) et restent bien désactivées lorsque coverage=off, ce qui sera vérifié indirectement en n’ajoutant aucune intégration dans orchestrator à ce stade.

Parent bullets couverts: [KR1, KR2, KR3, DEL1, DEL2, DEL3, DOD1, DOD2, TS1, TS2, TS3, TS4]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
