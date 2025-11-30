Task: 9321   Title: Extend COMPREHENSIVE_FEATURE_SUPPORT.md with coverage-aware notes
Anchors: [cov://§3#coverage-model, cov://§6#execution-modes-ux, cov://§8#technical-constraints-invariants]
Touched files:
- docs/COMPREHENSIVE_FEATURE_SUPPORT.md
- .taskmaster/docs/9321-traceability.md

Approach:
Pour la sous-tâche 9321.9321001, je vais ajouter à `docs/COMPREHENSIVE_FEATURE_SUPPORT.md` un court sous-paragraphe “Coverage-aware behavior” sous la section JSON Schema, en m’appuyant sur la SPEC coverage-aware (cov://§3#coverage-model, cov://§6#execution-modes-ux, cov://§8#technical-constraints-invariants). Ce bloc résumera quels aspects du support de fonctionnalités ont une sémantique coverage spécifique : AP:false/must-cover (PROPERTY_PRESENT adossé à CoverageIndex, cibles unreachable plutôt que devinées), `contains`/`minContains`/`maxContains` avec bag semantics comme source de cibles coverage, conditionnels (if/then/else) visibles via branches et propriétés optionnelles, dimensions boundaries/opérations lorsqu’elles sont activées, et la notion de cibles purement diagnostiques (par ex. SCHEMA_REUSED_COVERED) émises avec `status:'deprecated'` et exclues des dénominateurs. L’objectif est de donner, pour chaque catégorie de fonctionnalités déjà listée, un angle “coverage”: comment ces features se reflètent en targets/dimensions et en métriques, sans recopier la SPEC ni transformer cette page en guide coverage complet (qui reste dans les docs coverage). Je veillerai à rester cohérent avec Invariants.md/ARCHITECTURE.md et à mettre à jour `.taskmaster/docs/9321-traceability.md` pour marquer cette sous-tâche comme couvrant [KR1, DEL1, DOD1, TS1].

Risks/Unknowns:
- Risque de ré-expliquer trop de détails coverage sur une page qui est d’abord centrée sur le support de fonctionnalités JSON Schema; je garderai le texte concis, en renvoyant vers la SPEC coverage-aware et les sections Invariants/Architecture pour les détails.
- Il faut éviter de créer de la divergence entre ce résumé et les invariants coverage déjà décrits (IDs stables, dimensionsEnabled comme projection, excludeUnreachable agissant uniquement sur le dénominateur, cibles diagnostiques exclues des métriques); je m’alignerai explicitement sur ces invariants pour toute mention coverage.
- Cette sous-tâche n’introduit pas de nouvelle matrice ni de tableau; il faudra vérifier que le ton reste cohérent avec le reste de COMPREHENSIVE_FEATURE_SUPPORT.md (focus sur “ce que le moteur fait” plutôt que sur les options CLI).

Parent bullets couverts: [KR1, DEL1, DOD1, TS1]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
