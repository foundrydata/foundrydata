Task: 9302   Title: Instrument repair and property presence
Anchors: [cov://§3#coverage-model, cov://§3#dimensions, cov://§4#generator-instrumentation, cov://§3#property-present, spec://§8#coverage-index]
Touched files:
- packages/core/src/generator/foundry-generator.ts
- packages/core/src/repair/repair-engine.ts
- packages/core/src/repair/__tests__/contains-repair.test.ts
- packages/core/src/generator/__tests__/coverage-branches-enum.test.ts

Approach:
Pour cette sous-tâche, je vais étendre l’instrumentation de couverture existante de manière à couvrir la présence de propriétés sur les instances finales et les modifications introduites par la phase de Repair, tout en respectant les invariants M0 (cov://§3#coverage-model, cov://§3#dimensions). Côté générateur, j’ajouterai l’émission d’événements `PROPERTY_PRESENT` lorsque des propriétés optionnelles sont matérialisées dans les objets produits, en attachant les événements aux pointeurs canoniques des propriétés (`#/properties/...`) et en laissant intacte la logique AP:false sous-jacente à `CoverageIndex` (cov://§3#property-present, spec://§8#coverage-index). Côté Repair, j’instrumenterai `repair-engine.ts` pour émettre des événements supplémentaires lorsque des propriétés sont ajoutées ou supprimées afin de respecter la sémantique “après Repair” décrite pour M0, en conservant l’instance finale comme source de vérité. Dans les deux cas, l’instrumentation restera passive : les événements seront envoyés via le hook coverage déjà introduit dans le générateur, sans changer les chemins de génération ni le comportement de Repair lorsque coverage=off. Les tests existants sur Repair seront complétés par des assertions sur les événements de couverture pour des schémas AP:false et non-AP:false, en s’assurant que, sous AP:false, les noms de propriétés présents sont toujours cohérents avec `CoverageIndex.has` / `enumerate` et qu’aucune approximation supplémentaire n’est introduite.

Risks/Unknowns:
Les principaux risques concernent la bonne synchronisation entre les événements émis par Generate et ceux émis par Repair (pour éviter les doublons ou les trous sur PROPERTY_PRESENT), ainsi que le respect strict des invariants AP:false autour de CoverageIndex lorsque Repair ajoute des propriétés dérivées de patternProperties ou propertyNames ; je limiterai la surface à des cas où CoverageIndex fournit déjà les noms admissibles et vérifierai dans les tests que les événements de présence ne sont jamais émis pour des noms non couverts par CoverageIndex sous AP:false.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
