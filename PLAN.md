Task: 9306   Title: 9306.9306009 – Implement hint trace and Repair-side unsatisfied hints
Anchors: [cov://§4#generator-instrumentation, cov://§5#unsatisfied-hints-repair, cov://§7#json-coverage-report]
Touched files:
- packages/core/src/generator/foundry-generator.ts
- packages/core/src/repair/repair-engine.ts
- packages/core/src/repair/__tests__/repair-hints.spec.ts
- .taskmaster/docs/9306-traceability.md
- PLAN.md

Approach:
Pour la sous-tâche 9306.9306009, je vais d’abord introduire une trace de hints par instance dans le générateur, conforme à §4.3 : chaque fois qu’un hint est effectivement appliqué (preferBranch, ensurePropertyPresence, coverEnumValue), le générateur enregistrera un enregistrement interne associant `(kind, canonPath, params)` à un `instancePath` AJV (chemin dans l’instance). Cette trace restera purement diagnostique (pas d’impact sur RNG ni sur la forme JSON) et sera exposée via les options de couverture vers Repair en `coverage=guided`, de manière à ce que Repair puisse savoir quelles valeurs ont été influencées par quels hints.

Ensuite, j’étendrai `repairItemsAjvDriven` pour consommer cette trace et émettre, de façon best-effort mais déterministe, des `UnsatisfiedHint` côté Repair lorsque (a) une valeur influencée par un hint est modifiée et que le hint n’est plus satisfait dans l’instance finale (`REPAIR_MODIFIED_VALUE`), ou (b) lorsque des contraintes rendent le hint impossible à satisfaire (`CONFLICTING_CONSTRAINTS`), en respectant la hiérarchie de `reasonCode` recommandée (§5.3). Côté tests, je créerai un nouveau fichier `repair-hints.spec.ts` avec des scénarios ciblés qui génèrent une instance guidée par des hints, forcent Repair à modifier ou invalider ces valeurs (par exemple via des contraintes supplémentaires ou des erreurs Ajv), et vérifient que les `UnsatisfiedHint` attendus apparaissent dans le rapport via `executePipeline` sans changer les métriques ni le comportement de `coverage=off`/`coverage=measure`.

Risks/Unknowns:
Les principaux risques sont : (1) introduire, par erreur, un couplage entre la trace de hints et le RNG ou la structure des instances (violant les invariants de déterminisme de §6.1/6.2) ; (2) rendre Repair trop intrusif en sur‑produisant des `UnsatisfiedHint` (par exemple en déclarant `REPAIR_MODIFIED_VALUE` alors que le hint reste satisfait dans l’instance finale) ; (3) faire baisser la lisibilité ou la performance de `repair-engine` en ajoutant une instrumentation trop lourde. Pour limiter ces risques, je garderai la trace de hints encapsulée dans le contexte de génération / réparation, je m’appuierai uniquement sur les informations déjà disponibles (canonPath, instancePath, diagnostics UNSAT) pour classifier les cas, et j’écrirai des tests ciblés qui vérifient à la fois la présence des `UnsatisfiedHint` attendus et l’absence d’impact sur les métriques et les modes `off`/`measure`.

Parent bullets couverts: [KR4, KR5, DEL3, DOD3, DOD4, TS3]

SPEC-check: conforme aux anchors listés, aucun écart identifié ; cette sous-tâche introduira la trace de hints partagée Generate↔Repair et la détection best-effort des unsatisfiedHints côté Repair, tout en respectant le caractère diagnostique-only de ces entrées et les contraintes de déterminisme.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
