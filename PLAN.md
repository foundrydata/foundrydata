Task: 9307   Title: Wire streaming coverage into pipeline phases (subtask 9307.9307002)
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
Pour la sous-tâche 9307.9307002, je vais brancher l’accumulateur streaming et l’état par instance définis dans le module coverage sur les phases Generate, Repair et Validate du pipeline, de manière à ce que les événements de couverture soient collectés au fil de la génération/réparation mais que les hits ne soient engagés dans le bitmap global qu’après validation, conformément à cov://§4#generator-instrumentation et cov://§8#technical-constraints-invariants. L’idée est d’introduire une couche de “hook” coverage dans l’orchestrateur qui crée un accumulateur streaming à partir des CoverageTargets produits par CoverageAnalyzer, fournit aux phases Generate/Repair une API de type emitForItem(index, event) pour associer les événements à un état par instance, puis laisse Validate décider, instance par instance, quelles traces doivent être commitées.

Concrètement, dans `events.ts` et `index.ts`, je réutiliserai l’accumulateur streaming existant et son API `createInstanceState/commitInstance`. Dans l’orchestrateur, je ferai évoluer `CoverageHookOptions` pour exposer `emitForItem` et j’instancierai un `StreamingCoverageAccumulator` et un tableau d’InstanceCoverageState indexé par position d’item. Le générateur sera adapté pour suivre l’index de l’instance courante et, lorsqu’un hook streaming est présent, appeler `emitForItem(itemIndex, event)` plutôt que d’écrire directement sur le bitmap global. Le moteur de repair fera de même lors des corrections AJV-driven. Enfin, la fonction de validation par défaut sera enrichie d’un callback interne qui, pour chaque élément validé, appelle `commitInstance` sur l’état correspondant ou le réinitialise en cas d’échec, pour garantir que les hits ne reflètent que les instances acceptées. Je complèterai `pipeline-orchestrator.test.ts` avec un test ciblé pour vérifier que la couverture reste identique à l’existant en mode measure et que le flux coverage=off vs coverage=measure conserve des sorties identiques.

Risks/Unknowns:
Le principal risque vient de la complexité d’intégration dans le pipeline : il faut éviter que la nouvelle API coverage introduise des chemins non testés ou casse des overrides de stages existants. Pour limiter cela, je conserverai la signature actuelle de `executePipeline` et des overrides, en rendant les nouveaux hooks coverage optionnels et en préservant `createCoverageAccumulator` comme fallback pour les usages qui ne connaissent pas le streaming. Un autre risque concerne le couplage avec la validation : en l’état, la validation par défaut retourne un booléen global, il faudra donc veiller à ce que le callback interne ne soit déclenché que dans le chemin standard, sans affecter les scénarios où la validation est contournée (skipEligible, overrides). Côté performance, je m’assurerai que les structures par instance restent proportionnelles au nombre d’instances et que `commitInstance` n’introduit pas de comportement quadratique, en gardant l’index CoverageTarget → id partagé et en ne stockant que des ensembles d’identifiants. Enfin, il faudra vérifier que coverage=off continue de ne pas instancier d’Analyzer ni d’instrumentation, conformément aux invariants de gating.

Parent bullets couverts: [KR1, KR2, KR3, KR4, KR6, DEL3, DOD2, DOD3, DOD4, TS2, TS3, TS4]

SPEC-check: conforme aux anchors listés, pas d’écart identifié ; intégration limitée aux phases Generate/Repair/Validate sans modifier CoverageAnalyzer ni CoverageEvaluator, commits déclenchés uniquement après validate.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
