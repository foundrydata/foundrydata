Task: 9305   Title: 9305.9305002 – Implement greedy prioritization and budget handling
Anchors: [cov://§4#coverage-planner, cov://§5#hints-interaction-with-repair, cov://§6#execution-modes-ux, cov://§6#budget-profiles]
Touched files:
- packages/core/src/coverage/index.ts
- packages/core/src/coverage/coverage-planner.ts
- packages/core/src/pipeline/types.ts
- .taskmaster/docs/9305-traceability.md
- PLAN.md

Approach:
Pour la sous-tâche 9305.9305002, je vais implémenter un planner statique qui, à partir de `CoverageGraph`, de la liste complète des `CoverageTarget` et d’un `CoveragePlannerConfig`, construit une séquence de `TestUnit` en appliquant les règles de priorisation et le budget `maxInstances` décrits dans la SPEC. Concrètement, je vais introduire une fonction pure (par exemple `planTestUnits`) dans `coverage-planner.ts` qui trie d’abord les cibles en respectant l’ordre opérations → dimensions (branches → enum → structure → boundaries) → poids éventuel → `canonPath`, puis regroupe ces cibles en unités de test en respectant le budget global : la somme des `count` des TestUnits ne dépassera jamais `maxInstances`, et le planner pourra s’arrêter dès que toutes les cibles actives ont été attachées à au moins une unité. Les caps et diagnostics resteront des no-op dans cette sous-tâche (pas de mutation sur `meta.planned` ni de `plannerCapsHit`), afin de les implémenter séparément dans 9305.9305003.

Je veillerai à ce que l’algorithme reste déterministe pour un ensemble donné de cibles et de configuration : aucun RNG ne sera utilisé à ce stade, et l’ordre produit sera intégralement dérivé des propriétés stables des targets (dimension, kind, `operationKey`, `canonPath`, `weight`). La génération des seeds par TestUnit restera volontairement simple (par exemple en acceptant un `seedBase` ou en laissant un champ à renseigner) pour ne pas empiéter sur 9305.9305004 qui se focalise sur la dérivation déterministe des seeds. Côté tests, j’ajouterai une batterie de cas unitaires sur de petits ensembles de `CoverageTarget` synthétiques pour vérifier l’ordre, la stabilité, le respect du budget et l’arrêt anticipé lorsque toutes les cibles actives sont couvertes, tout en laissant la gestion des caps et des diagnostics à la sous-tâche suivante.

Risks/Unknowns:
Le risque principal est de laisser fuiter des responsabilités de caps, de diagnostics ou de seeds dans cette sous-tâche, ce qui compliquerait la séparation avec 9305.9305003 et 9305.9305004 et rendrait la traçabilité moins claire. Je vais donc garder `planTestUnits` concentré sur l’ordre et la répartition sous budget, en supposant que la dérivation fine des seeds et la mise à jour de `meta.planned`/`plannerCapsHit` seront branchées ultérieurement. Autre point d’attention : la définition de la granularité des TestUnits (par cible individuelle ou par groupe) doit rester compatible avec les futures hints et profils; je privilégierai une approche simple et explicite (une cible principale par TestUnit, avec `count` dérivé du budget restant) afin de garder l’API évolutive.

Parent bullets couverts: [KR2, KR3, KR4, DEL1, DOD1, DOD2, TS1]

SPEC-check: conforme aux anchors listés, pas d’écart identifié ; cette sous-tâche se limite à l’algorithme greedy statique et au respect de `maxInstances` comme borne supérieure, sans introduire de caps ou de diagnostics (`plannerCapsHit`, `meta.planned:false`) ni de logique de seed avancée qui sont toutes réservées aux sous-tâches suivantes 9305.9305003 et 9305.9305004.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
