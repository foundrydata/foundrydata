Task: 9312   Title: Document coverage invariants and limitations
Anchors: [cov://§3#coverage-model, cov://§7#json-coverage-report, cov://§3#dimensions]
Touched files:
- docs/spec-coverage-aware-v1.0.md
- .taskmaster/docs/9312-traceability.md

Approach:
Pour 9312.9312004, je vais renforcer la spécification `docs/spec-coverage-aware-v1.0.md` pour expliciter les invariants coverage‑aware déjà mis en œuvre dans le code: statuts des cibles (`active`, `unreachable`, `deprecated`), rôle de `SCHEMA_REUSED_COVERED` comme cible purement diagnostique et absence volontaire d’un tableau `unreachableTargets` dans `coverage-report/v1`. Dans la section sur la dimension `operations` (cov://§3#dimensions), j’alignerai la prose sur le comportement de l’évaluator en précisant que `SCHEMA_REUSED_COVERED` est toujours émis avec `status:'deprecated'`, `dimension:'operations'` et qu’il ne contribue jamais aux dénominateurs de `coverage.overall`, `coverage.byDimension`, `coverage.byOperation` ni à l’enforcement de `minCoverage`; ces cibles restent visibles dans `targets[]` / `uncoveredTargets[]` et ne sont comptabilisées que dans `metrics.targetsByStatus.deprecated` (cov://§3#coverage-model, cov://§7#json-coverage-report). Dans la section 7.1 (JSON coverage report), je vérifierai que la représentation des cibles `status:'unreachable'` et la phrase normative sur l’absence de champ `unreachableTargets` sont explicites et cohérentes avec le type `CoverageReport`; si nécessaire, j’ajouterai une courte note rappelant que les consommateurs doivent dériver toute vue “unreachable” en filtrant `targets` / `uncoveredTargets` et que cette décision est intentionnelle pour conserver un format compact et stable. Enfin, je m’assurerai que ces ajouts restent compatibles avec les invariants du pipeline décrits dans les autres docs (Invariants/Architecture) sans dupliquer inutilement leur contenu.

Risks/Unknowns:
- Le document coverage-aware étant déjà dense, le principal risque est de réintroduire de la redondance ou de rendre certaines sections moins lisibles; je viserai des ajouts courts, ancrés dans les sections existantes (statuts, dimension `operations`, JSON report) plutôt que de nouvelles sections entières.
- Il faudra veiller à rester parfaitement aligné avec l’implémentation actuelle (evaluator, Analyzer OpenAPI): si un écart est détecté (par exemple présence involontaire de `SCHEMA_REUSED_COVERED` dans les métriques), il faudra le traiter dans une autre tâche plutôt que d’étendre la SPEC à posteriori.
- Toute mention aux docs d’architecture / invariants devra rester sous forme de renvoi conceptuel sans copier ces documents, pour respecter la politique REFONLY et limiter les divergences futures.

Parent bullets couverts: [KR5, DEL3, DOD4, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
