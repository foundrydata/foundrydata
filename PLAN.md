Task: 9602   Title: Add observability regression tests for repair/G_valid metrics (subtask 9602.9602003)
Anchors: [spec://§2#observability-surfaces, spec://§10#repair-philosophy-observability, spec://§15#metrics, spec://§15#rng]
Touched files:
- packages/core/src/transform/g-valid-classifier.ts
- packages/core/src/util/repair-usage-metrics.ts
- packages/core/src/repair/repair-engine.ts
- packages/core/src/repair/__tests__/mapping-repair.test.ts
- packages/core/src/pipeline/__tests__/repair-observability.regression.test.ts
- test/acceptance/gvalid-no-repair.acceptance.spec.ts

Approach:
Objectif: corriger la conformité des métriques G_valid/Tier (spec://§15#metrics, spec://§10#repair-philosophy-observability) en alignant le motif array sur le nom canonique `gValid_arrayContainsSimple_*` et en comptant les éléments (pas seulement les items) tout en gardant l’observabilité passive (spec://§2#observability-surfaces). (1) Renommer le motif `ArrayItemsContainsSimple` dans le classifieur G_valid et propager la clé dans la collecte de métriques afin que les compteurs suivent la nomenclature SPEC. (2) Revoir `recordRepairUsageEvent` pour accepter un delta d’items et calculer les compteurs G_valid à partir de la taille réelle des tableaux (items, itemsWithRepair/actions si touchés), en restant déterministe et sans changer la sémantique Repair. (3) Ajuster le chemin métrique dans l’engine Repair pour enregistrer les compteurs par élément (incluant le cas zéro action) et conserver les tiers/policy blocks inchangés. (4) Mettre à jour les tests unitaires/intégration/acceptance (mapping-repair, pipeline regression, gvalid-no-repair) pour refléter les nouveaux noms et les totaux par élément, puis vérifier que le comparateur de déterminisme continue d’ignorer uniquement les métriques non déterministes (spec://§15#rng). (5) Garder la couverture indépendante de coverage/metrics toggle via les tests existants, et réexécuter la chaîne build → typecheck → lint → test → bench.

Risks/Unknowns:
- Comptage par élément: s’assurer que le delta d’items ne double pas les actions et reste stable avec allowStructuralInGValid.
- Renommage motif: vérifier qu’aucun consommateur (reporter/traceabilité) n’attend l’ancienne clé.
- ItemsWithRepair: calcul conservateur basé sur actions peut sous-estimer certains cas; documenter dans les tests si besoin.

Parent bullets couverts: [KR1, KR2, DOD1, DOD3, TS1, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
