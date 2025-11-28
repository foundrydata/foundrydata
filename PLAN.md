Task: 9305   Title: 9305.9305001 – Design TestUnit structure and planner inputs
Anchors: [cov://§4#architecture-components, cov://§4#coverage-planner, cov://§5#hints-interaction-with-repair]
Touched files:
- packages/core/src/coverage/index.ts
- packages/core/src/coverage/coverage-planner.ts
- packages/core/src/pipeline/types.ts
- .taskmaster/docs/9305-traceability.md
- PLAN.md

Approach:
Pour la sous-tâche 9305.9305001, je vais d’abord formaliser la structure `TestUnit` et les types de hints à partir de la SPEC coverage-aware (Architecture & components, CoveragePlanner, Hints). L’objectif est de disposer d’un contrat stable pour le planner V1 : chaque TestUnit doit encapsuler un identifiant stable, un seed dérivé du masterSeed, un nombre planifié d’instances (count) et une liste de hints typés, avec une portée optionnelle (operationKey, schemaPaths) permettant de cibler des zones du CoverageGraph. Ces types seront définis dans le module coverage core, de façon à pouvoir être réutilisés par le planner, le générateur et les rapports, tout en restant strictement passifs à ce stade (aucune logique de sélection ni de seed-derivation dans cette sous-tâche).

Ensuite, je vais définir un type de configuration de planner qui capture les objectifs décrits par la SPEC: dimensionsEnabled effectivement poursuivies, budget maxInstances (et éventuellement un soft time cap), ainsi qu’un schéma de priorisation et de caps suffisamment expressif pour couvrir les besoins de V1 (priorité par dimension et caps par dimension/schema/operation) tout en restant simple à manipuler. Ce type de configuration sera intégré à la fois côté coverage (CoveragePlannerInput combinant CoverageGraph, CoverageTargets et config) et dans les options du pipeline pour préparer le câblage ultérieur avec la CLI et les profils, sans encore modifier l’orchestrateur ni exécuter le planner. Je compléterai enfin par des tests de forme/type et quelques cas simples de construction de TestUnit et de configuration pour verrouiller l’API publique avant d’implémenter l’algorithme greedy dans les sous-tâches suivantes.

Risks/Unknowns:
Le principal risque est de figer trop tôt une forme de configuration des caps ou des priorités qui compliquerait l’implémentation des sous-tâches suivantes (caps, seeds, intégration pipeline) ou la génération de diagnostics `plannerCapsHit`. Je vais donc privilégier des structures explicites mais flexibles (par exemple des listes de règles plutôt que des maps opaques) tout en limitant le périmètre aux besoins identifiés de V1. Autre point d’attention : l’intégration avec PipelineOptions ne doit pas préempter un éventuel travail dédié sur le mapping CLI/profils; je veillerai à n’ajouter que les champs strictement nécessaires pour exprimer maxInstances et les objectifs de dimensions, en laissant les détails des profils à une future tâche.

Parent bullets couverts: [KR1, KR2, DEL1, TS1]

SPEC-check: conforme aux anchors listés, pas d’écart identifié ; la sous-tâche se limite à la définition de types TestUnit/hints et de la configuration du planner, sans implémenter l’algorithme greedy, les caps ni l’intégration orchestrateur, qui sont couverts par d’autres sous-tâches 9305.x.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
