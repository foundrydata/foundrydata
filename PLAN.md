Task: 9333   Title: Harden CLI coverage profiles and coverage-report UX — subtask 9333.9333003
Anchors: [cov://§3#coverage-model, cov://§6#budget-profiles, cov://§7#json-coverage-report, cov://§7#cli-summary]
Touched files:
- PLAN.md
- .taskmaster/docs/9333-traceability.md
- docs/Features.md

Approach:
Pour la sous-tâche 9333.9333003, je vais documenter une configuration CI recommandée qui s’appuie sur la sémantique des profils coverage (cov://§6#budget-profiles) et sur la forme de coverage-report/v1 et du résumé CLI (cov://§3#coverage-model, cov://§7#json-coverage-report, cov://§7#cli-summary), en capitalisant sur les tests ajoutés dans 9333.9333001/9333.9333002. Concrètement : (1) ajouter dans `docs/Features.md` une section “Coverage en CI” qui décrit un scénario type `coverage=measure` avec un profil (par exemple `balanced`) et un `coverage-min` explicite, en précisant comment cela se traduit en `dimensionsEnabled`, budget d’instances et thresholds; (2) illustrer le flux empirique côté CLI (`foundrydata generate` / `openapi`) en montrant comment consommer le fichier coverage-report/v1 (chemins metrics.overall/byDimension/byOperation/targetsByStatus et diagnostics) et le résumé stderr pour les logs CI, sans recopier la SPEC mais en renvoyant conceptuellement vers ces champs; (3) veiller à ce que les exemples textuels restent alignés avec les profils et résumés réellement testés (semantique des profils quick/balanced/thorough, présence des lignes `coverage by dimension`, `coverage overall`, `targets by status`, `planner caps`, `unsatisfied hints`) afin que les docs ne divergent pas des comportements couverts par les tests; (4) garder le ton prescriptif (“profil recommandé”) tout en laissant à la plateforme la liberté d’ajuster les seuils numériques exacts.

DoD:
- [x] Une section dédiée de `docs/Features.md` décrit un profil CI recommandé (coverage mode/profile/minCoverage) cohérent avec les presets et budgets de la spec (cov://§6#budget-profiles).
- [x] Les docs expliquent comment lire coverage-report/v1 et le résumé CLI dans ce contexte (overall, byDimension/byOperation, targetsByStatus, caps, unsatisfied hints) sans contredire la spec (cov://§3#coverage-model, cov://§7#json-coverage-report, cov://§7#cli-summary).
- [x] build/typecheck/lint/test/bench OK.

Parent bullets couverts: [KR3, DEL3, DOD3, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
