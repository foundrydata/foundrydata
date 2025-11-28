Task: 9305   Title: 9305.9305004 – Derive deterministic seeds for TestUnits
Anchors: [cov://§4#coverage-planner, cov://§6#execution-modes-ux]
Touched files:
- packages/core/src/coverage/index.ts
- packages/core/src/coverage/coverage-planner.ts
- packages/core/src/pipeline/types.ts
- .taskmaster/docs/9305-traceability.md
- PLAN.md

Approach:
Pour la sous-tâche 9305.9305004, je vais ajouter une dérivation déterministe des seeds de TestUnit à partir du masterSeed du run, en respectant le modèle RNG existant (`XorShift32` / `normalizeSeed`) et les contraintes de la SPEC coverage-aware. L’idée est d’exposer une petite API de planning (par exemple une fonction `assignTestUnitSeeds`) qui prend un `masterSeed` normalisé et la liste de `TestUnit` construits par `planTestUnits`, puis qui remplit le champ `seed` de chaque unité à partir d’une fonction pure de `(masterSeed, unitId, scope)` sans introduire de RNG supplémentaire ni perturber le pattern d’appels RNG du générateur. Pour rester aligné avec les usages actuels, je m’appuierai sur `XorShift32` avec un canonPath synthétique dérivé de `TestUnit.id` et éventuellement du `operationKey`, de façon à garantir que la même configuration (schema, options, masterSeed) produise toujours les mêmes seeds de TestUnit.

Je laisserai le pipeline et le CoverageReport continuer à traiter `run.seed` et `run.masterSeed` comme aujourd’hui (seed == masterSeed en V1), en me concentrant uniquement sur la cohérence interne des seeds de TestUnit. Côté tests, j’étendrai `coverage-planner.test.ts` pour vérifier que, pour un `masterSeed` donné, l’appel à la nouvelle fonction produit des seeds stables sur plusieurs exécutions et que de petits changements (dans `unit.id` ou `masterSeed`) entraînent des variations attendues. Les tests vérifieront aussi que la dérivation reste pure (mêmes inputs ⇒ mêmes seeds) et ne dépend pas de l’ordre d’appel ou d’un état global caché.

Risks/Unknowns:
Le principal risque est de créer un système de seeds qui ne soit pas clairement lié au masterSeed ou qui puisse diverger silencieusement si le format des `TestUnit.id`/`scope` change. Je vais limiter la dérivation à une combinaison simple (masterSeed + identifiant stable de TestUnit/operation) documentée dans le code de test, en évitant toute dépendance à l’index d’itération ou à des mutable globals. Autre point d’attention : ne pas introduire une nouvelle source RNG indépendante; j’utiliserai l’implémentation existante `XorShift32` comme fonction pure de hashage pour les seeds de TestUnit, de manière à rester conforme au contrat “pas de RNG supplémentaire” et à faciliter le raisonnement sur la stabilité.

Parent bullets couverts: [KR6, DOD4, TS2]

SPEC-check: conforme aux anchors listés, pas d’écart identifié ; cette sous-tâche se concentre sur la dérivation déterministe des seeds de TestUnit à partir du masterSeed et de l’identifiant de l’unité, sans modifier la sémantique des modes coverage ni le calcul des métriques, qui restent du ressort des tâches précédentes (9303) et des autres sous-tâches 9305.x.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
