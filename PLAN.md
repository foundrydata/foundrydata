Task: 9321   Title: Expand Known-Limits.md with coverage-aware limits
Anchors: [cov://§3#coverage-model, cov://§7#json-coverage-report, cov://§8#technical-constraints-invariants]
Touched files:
- docs/Known-Limits.md
- .taskmaster/docs/9321-traceability.md

Approach:
Pour la sous-tâche 9321.9321003, je vais enrichir `docs/Known-Limits.md` avec une sous-section explicite sur les limites coverage-aware, en m’appuyant sur la SPEC coverage-aware (cov://§3#coverage-model, cov://§7#json-coverage-report, cov://§8#technical-constraints-invariants). Cette section détaillera : (1) les caps sur le nombre de cibles par dimension/schema/opération côté planificateur (par ex. limites configurables sur les targets pour éviter l’explosion combinatoire, tout en restant déterministes), (2) les nuances AP:false côté coverage (PROPERTY_PRESENT uniquement adossé à CoverageIndex, cibles unreachable ou non matérialisées plutôt que devinées, pas d’automate parallèle), (3) les contraintes autour de la dimension boundaries (ciblage des min/max, impact potentiel sur le volume de cibles et caps associés) et (4) les effets de `dimensionsEnabled` / `excludeUnreachable` sur les dénominateurs de coverage tout en gardant les IDs/statuts stables. Je rappellerai également que les targets purement diagnostiques (comme `SCHEMA_REUSED_COVERED` en `status:'deprecated'`) n’entrent jamais dans les dénominateurs ni dans `minCoverage`, même lorsqu’elles sont présentes dans `targets` / `uncoveredTargets`, et que `operationsScope`/`selectedOperations` imposent des contraintes de compatibilité sur `coverage.byOperation` et le diff de rapports. L’objectif est de rendre visibles ces limites/précautions pour les utilisateurs sans réécrire toute la SPEC.

Risks/Unknowns:
- Risque de figer des chiffres ou caps trop précis alors qu’ils sont configurables ou susceptibles d’évoluer; je resterai au niveau des principes (présence de caps, comportement en cas de dépassement, diagnostics) en renvoyant à la SPEC et au code pour les valeurs exactes.
- Il faut éviter de contredire les invariants déjà décrits (ID stables, projection via dimensionsEnabled, excludeUnreachable sur le dénominateur, cibles diagnostiques hors métriques); je m’alignerai avec Invariants.md/ARCHITECTURE.md pour toutes les mentions coverage.
- La page Known-Limits est déjà dense; je veillerai à insérer la section coverage-aware de manière lisible, en regroupant les points coverage plutôt qu’en dispersant des bullets partout.

Parent bullets couverts: [KR3, KR4, DEL3, DOD3, TS1]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
