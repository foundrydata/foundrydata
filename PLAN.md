Task: 9306   Title: 9306.9306007 – Attach ensurePropertyPresence hints for PROPERTY_PRESENT targets in CoveragePlanner
Anchors: [cov://§3#dimensions-v1, cov://§4#coverage-planner, cov://§5#hint-types, cov://§5#priority-conflict-resolution]
Touched files:
- packages/core/src/coverage/coverage-planner.ts
- packages/core/src/coverage/__tests__/coverage-planner.test.ts
- .taskmaster/docs/9306-traceability.md
- PLAN.md

Approach:
Pour la sous-tâche 9306.9306007, je vais étendre le CoveragePlanner afin de dériver, pour chaque cible `PROPERTY_PRESENT` active produite par le CoverageAnalyzer, un hint `ensurePropertyPresence(schemaPath, property, present:true)` attaché au nœud schéma “propriétaire” (l’objet) et non au sous-nœud de propriété. Concrètement, j’ajouterai un cas `PROPERTY_PRESENT` dans `buildHintsForTarget` qui lit `target.params.propertyName`, remonte au chemin canonique de l’objet via les pointeurs parents, construit un hint avec `canonPath` déterministe vers ce nœud et `present:true`, puis insère ce hint dans `TestUnit.hints` uniquement lorsque la dimension `structure` est effectivement activée dans `dimensionsEnabled`, en laissant intacts les IDs, l’ordre et le statut des `CoverageTargets`.

Côté tests, je compléterai `coverage-planner.test.ts` avec des cas centrés sur les cibles `PROPERTY_PRESENT` : (a) un test minimal qui vérifie qu’un target `PROPERTY_PRESENT` pour `#/properties/name` produit un TestUnit contenant un hint `ensurePropertyPresence` avec `canonPath:'#'` et `params.propertyName:'name'`, (b) un cas pour un objet imbriqué (`#/properties/parent/properties/child`) qui valide la remontée correcte vers le nœud objet propriétaire, et (c) des assertions que les hints ne sont produits que lorsque la dimension `'structure'` est activée, de manière à respecter la projection par `dimensionsEnabled`. Je vérifierai aussi que l’ordre des TestUnits et des cibles reste déterministe et qu’aucun nouveau RNG ni heuristique AP:false n’est introduit dans le planner, en s’alignant strictement sur les invariants de la SPEC pour `PROPERTY_PRESENT` et sur les règles de priorité/“first in hints[] wins” déjà en place.

Risks/Unknowns:
Les principaux risques sont : (1) mal calculer le chemin canonique du nœud objet propriétaire et produire des hints avec un `canonPath` qui ne correspond pas à celui utilisé par le générateur pour ordonner les propriétés optionnelles, ce qui rendrait les hints inopérants malgré une surface “correcte” côté planner ; (2) violer les invariants AP:false / CoverageIndex en essayant d’inférer des noms supplémentaires ou en modifiant la définition des cibles `PROPERTY_PRESENT` au lieu de simplement les consommer ; (3) introduire un couplage involontaire entre `dimensionsEnabled` et l’univers des IDs ou l’ordonnancement des cibles. Pour limiter ces risques, je me contenterai de consommer les cibles `PROPERTY_PRESENT` déjà émises par l’Analyzer, en dérivant le `canonPath` objet uniquement à partir du pointer de la cible (sans heuristique supplémentaire ni accès à CoverageIndex), en gardant la logique de tri existante pour les cibles et en encadrant les tests de façon à vérifier à la fois la forme des hints produits et leur stabilité pour un même ensemble de cibles/planner config.

Parent bullets couverts: [KR1, DOD1, DOD4, TS2]

SPEC-check: conforme aux anchors listés, aucun écart identifié ; cette sous-tâche se limite à projeter les cibles PROPERTY_PRESENT du CoverageAnalyzer en hints ensurePropertyPresence sur les nœuds objets dans le CoveragePlanner et à ajouter des tests planner-level, sans modifier le modèle de couverture, la définition des cibles ni le comportement des modes off/measure.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
