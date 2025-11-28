Task: 9307   Title: Remove any post-pass coverage computation (subtask 9307.9307003)
Anchors: [cov://§4#architecture-components, cov://§4#generator-instrumentation, cov://§8#technical-constraints-invariants]
Touched files:
- packages/core/src/coverage/events.ts
- packages/core/src/coverage/index.ts
- packages/core/src/generator/foundry-generator.ts
- packages/core/src/repair/repair-engine.ts
- packages/core/src/pipeline/orchestrator.ts
- packages/core/src/pipeline/__tests__/pipeline-orchestrator.test.ts
- .taskmaster/docs/9307-traceability.md
- PLAN.md

Approach:
Pour la sous-tâche 9307.9307003, je vais vérifier qu’aucun chemin de code ne recalcule la couverture via un post-pass sur la sortie JSON et que la totalité des rapports coverage-report/v1 repose sur l’accumulateur streaming branché en 9307.9307002, conformément à cov://§4#generator-instrumentation et cov://§8#technical-constraints-invariants. Cela implique de confirmer que l’orchestrateur n’effectue plus de deuxième passe sur `artifacts.generated` ou `artifacts.repaired` pour reconstruire des hits, que le CLI ne réinterprète pas les items pour de la couverture, et que les tests n’assument plus l’existence d’un mode “post-pass” caché.

Concrètement, dans `orchestrator.ts`, je conserverai uniquement le chemin qui part des CoverageTargets produits par CoverageAnalyzer et applique `coverageAccumulator.toReport` puis CoverageEvaluator; si des helpers ou options hérités de la phase M0 (pre-streaming) existent encore pour rejouer la couverture sur un tableau d’items, je les supprimerai ou les marquerai explicitement hors scope V1. Dans les tests `pipeline-orchestrator.test.ts` et ceux du module coverage, je m’assurerai que les assertions portent sur les targets/hits/coverageReport issus du pipeline streaming, sans injection de faux hits via des accumulateurs reconstruits après coup. Enfin, je vérifierai qu’aucune doc ou commentaire n’encourage un pattern “reparse pour coverage”, et j’ajouterai au besoin une courte mention dans la traceability 9307 pour documenter que les chemins post-pass sont désormais considérés comme non conformes à V1.

Risks/Unknowns:
Le principal risque est de supprimer un chemin utilisé par des tests de bas niveau qui se basaient sur le calcul de coverage post-pass, ce qui pourrait réduire la lisibilité de certains scénarios de tests ou introduire des régressions si des utilitaires sont encore exposés publiquement. Pour limiter cela, je ciblerai uniquement les chemins qui relisent des items pour reconstruire des hits et je laisserai en place les utilitaires purement algorithmiques (par exemple `createCoverageAccumulator`) qui restent utiles pour des tests unitaires sur les targets. Un autre risque est de manquer un appel indirect (via le CLI ou le reporter) qui ferait encore un JSON.parse + recomputation de coverage; je passerai donc aussi par les fichiers CLI et reporter pour vérifier que la couverture y est consommée comme un rapport prêt à l’emploi plutôt que recalculée. Enfin, je veillerai à ne pas empiéter sur la sous-tâche 9307.9307004 (benchmark overhead) en gardant cette tâche focalisée sur la suppression/guarding des chemins post-pass plutôt que sur la mesure détaillée des performances.

Parent bullets couverts: [KR2, DOD2, DOD5]

SPEC-check: conforme aux anchors listés, pas d’écart identifié ; aucun recalcul coverage post-pass sur les items JSON, les rapports coverage-report/v1 s’appuient uniquement sur l’accumulateur streaming et CoverageEvaluator, et le cas `skippedValidation:true` a été formalisé dans une SPEC-QUESTION dédiée pour éviter toute interprétation implicite.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
