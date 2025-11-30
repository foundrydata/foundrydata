Task: 9321   Title: Fix dimensionsEnabled/excludeUnreachable documentation for coverage-aware limits
Anchors: [cov://§3#dimensions-v1, cov://§3#coverage-model, cov://§7#json-coverage-report, cov://§8#technical-constraints-invariants]
Touched files:
- docs/Known-Limits.md
- docs/COMPREHENSIVE_FEATURE_SUPPORT.md
- .taskmaster/docs/9321-traceability.md

Approach:
Pour la sous-tâche 9321.9321003, je vais corriger la description de `dimensionsEnabled` et `excludeUnreachable` dans `docs/Known-Limits.md` et `docs/COMPREHENSIVE_FEATURE_SUPPORT.md` afin qu’elle reflète exactement la SPEC coverage-aware V1 (cov://§3#dimensions-v1, cov://§3#coverage-model, cov://§7#json-coverage-report, cov://§8#technical-constraints-invariants) et le comportement réel de l’analyzer/evaluator. Concrètement, je vais remplacer les formulations actuelles qui laissent entendre que `dimensionsEnabled` n’affecte que les métriques par une description qui indique que seules les dimensions listées sont matérialisées en CoverageTargets pour un run, tout en rappelant que l’ID des cibles existantes reste stable lorsqu’on active ou désactive d’autres dimensions. Je garderai la sémantique existante d’`excludeUnreachable` (effet uniquement sur les dénominateurs, cibles `unreachable` toujours présentes dans `targets`/`uncoveredTargets`) et je vérifierai que les mentions de cibles purement diagnostiques (comme `SCHEMA_REUSED_COVERED` en `status:'deprecated'`) restent cohérentes avec l’évaluator et la SPEC. Aucune logique TypeScript n’est modifiée ; l’objectif est d’aligner strictement la documentation sur les invariants déjà garantis par le code et le coverage-report/v1, sans introduire de nouveau comportement.

Risks/Unknowns:
- Risque de créer une divergence entre ces deux fichiers et d’autres docs coverage (Invariants.md, ARCHITECTURE.md) si une ancienne formulation a été copié-collée; je ferai une passe rapide pour éviter toute contradiction flagrante au niveau des invariants de haut niveau.
- La nuance entre “univers de cibles conceptuel” et “cibles matérialisées dans targets[] pour un run donné” doit rester claire sans recopier la SPEC; je veillerai à parler de matérialisation/rapport plutôt que de redéfinir l’univers de cibles.
- Comme seules des docs sont modifiées, il n’y a pas de tests ciblés à ajouter; je m’appuierai sur la CI standard (build/typecheck/lint/test/bench) pour vérifier l’absence de régression dans le code ou les types.

Parent bullets couverts: [KR1, KR3, KR4, DEL1, DEL3, DOD1, DOD3, TS1]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
