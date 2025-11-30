Task: 9322   Title: Add coverage invariants section to Invariants.md
Anchors: [cov://§3#coverage-model, cov://§7#json-coverage-report, cov://§8#technical-constraints-invariants]
Touched files:
- docs/Invariants.md
- .taskmaster/docs/9322-traceability.md

Approach:
Pour la sous-tâche 9322.9322001, je vais ajouter à `docs/Invariants.md` une nouvelle section “Coverage invariants” qui complète les invariants de pipeline existants en décrivant, de manière synthétique, les garanties propres à la couche coverage-aware, en m’appuyant sur la SPEC coverage-aware (cov://§3#coverage-model, cov://§7#json-coverage-report, cov://§8#technical-constraints-invariants). Cette section couvrira : la stabilité des `CoverageTarget.id` pour un tuple fixé `(canonical schema, OpenAPI spec?, coverage options, seed, ajvMajor, registryFingerprint)` ; la sémantique des dimensions (`structure`, `branches`, `enum`, `boundaries`, `operations`) et le fait que `dimensionsEnabled` agit comme projection des métriques sans changer l’univers de cibles ni leurs IDs ; les statuts (`active`, `unreachable`, `deprecated`) et la garantie que les cibles purement diagnostiques (par exemple SCHEMA_REUSED_COVERED) ne contribuent pas aux dénominateurs de coverage. J’y décrirai aussi le comportement de `excludeUnreachable` (agit uniquement sur les dénominateurs, jamais sur les IDs/statuts), l’invariant AP:false (CoverageIndex reste la seule source de vérité pour PROPERTY_PRESENT sous AP:false) et le contrat de streaming/instrumentation (pas de second parse JSON, mise à jour des compteurs coverage après validation, aucun I/O réseau supplémentaire, AJV d’origine toujours utilisé comme oracle). Enfin, je mettrai à jour `.taskmaster/docs/9322-traceability.md` pour marquer cette sous-tâche comme couvrant [KR1, KR2, DEL1, DOD1, TS1] du parent 9322.

Risks/Unknowns:
- Le principal risque est de formuler des invariants qui divergeraient de l’implémentation réelle (par exemple en laissant entendre que `dimensionsEnabled` change l’univers de cibles ou que certaines cibles diagnostiques comptent dans les métriques) ; je m’alignerai sur le code coverage existant, les tests de `CoverageEvaluator` et `coverage-report-json` et les sections 3/7/8 de la SPEC pour ne documenter que des garanties déjà vérifiées.
- Il faudra garder le texte suffisamment général pour rester stable en V1 tout en étant utile : je privilégierai des invariants structurels (stabilité des IDs, projections de métriques, contraintes AP:false, absence de réseau, déterminisme) plutôt que des détails opérationnels susceptibles d’évoluer (par exemple des listes exhaustives de dimensions futures).
- Cette sous-tâche ne modifie pas le pipeline ni le code, uniquement la documentation ; je vérifierai néanmoins que les invariants décrits ne créent pas de conflit implicite avec ceux déjà listés pour Normalize/Compose/Generate/Repair/Validate, en traitant la couverture comme une couche additionnelle qui respecte ces invariants de base.

Parent bullets couverts: [KR1, KR2, DEL1, DOD1, TS1]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
