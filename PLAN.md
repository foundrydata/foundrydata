Task: 9601   Title: Add guided vs measure invariance regression tests (subtask 9601.9601002)
Anchors: [spec://§2#observability-surfaces, cov://§4#coverage-planner, cov://§5#coverage-report]
Touched files:
- PLAN.md
- .taskmaster/docs/9601-traceability.md
- packages/core/test/e2e/coverage-guided-vs-measure.spec.ts

Approach:
Je dois prouver que pour un tuple déterministe (schema/options/seed), `coverage=guided` ne sous-performe pas `coverage=measure` sur branches/enum et conserve des IDs stables (`spec://§2#observability-surfaces`, `cov://§4#coverage-planner`, `cov://§5#coverage-report`). Plan: (1) ajouter un test e2e dédié `coverage-guided-vs-measure.spec.ts` qui exécute deux fois `executePipeline` sur un schéma mêlant `oneOf` (branches) et `enum` avec le même seed/options (`generate.count`, `dimensionsEnabled=['branches','enum','structure']`, `excludeUnreachable:false`). (2) Asserts: statut pipeline identique, `coverageReport.targets` même ensemble d’IDs entre measure/guided, et pour chaque cible active branches/enum, si measure l’a frappée (`hit:true`), guided doit aussi la frapper (superset). (3) Vérifier les métriques: `byDimension['branches']` et `byDimension['enum']` guidées ≥ measure, et `uncoveredTargets` de guided est un sous-ensemble/same des IDs de targets non frappées en measure (pas de régression). (4) Garder l’ordre stable (tri par ID pour comparaisons) pour éviter des snapshots fragiles; pas de changement de pipeline ou de planner, uniquement des assertions. Mettre à jour la trace 9601 pour marquer KR2/DEL2/TS2 en cours et DoD checklist, puis rejouer la chaîne build → typecheck → lint → test → bench.

Risks/Unknowns:
- Le schéma choisi doit générer suffisamment de branches/enum pour rendre l’invariant visible sans allonger le runtime; ajuster `generate.count` si nécessaire.
- Les cibles unreachable ou deprecated pourraient brouiller les comparaisons; filtrer sur status actif/déprécié de façon explicite.
- Couverture guided peut être égale mais pas strictement supérieure pour certaines dimensions; les assertions doivent tolérer l’égalité.

Parent bullets couverts: [KR2, DEL2, DOD2, TS2]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true

Task: 9604   Title: Implement Reporter/Platform View derivation (subtask 9604.9604001)
Anchors: [spec://§2#observability-surfaces, spec://§7#platform-kpis-gates, cov://§5#coverage-report, spec://§19#payloads, spec://§15#metrics]
Touched files:
- .taskmaster/docs/9604-traceability.md
- packages/reporter/src/platform-view/index.ts
- packages/reporter/src/platform-view/__tests__/platform-view.test.ts
- packages/reporter/test/fixtures/coverage-report.v1.sample.json

Approach:
Objectif: matérialiser la vue dérivée “reporter-platform-view/v1” (Appendix A) à partir de `diag.metrics` + `coverage-report/v1` sans introduire de nouvelles sémantiques ni d’I/O, en conservant la comparabilité (seed, registryFingerprint, coverage scope). Plan: (1) Créer un builder `packages/reporter/src/platform-view/index.ts` qui prend `diag.metrics` (DiagMetrics) + couverture optionnelle (CoverageReport) et produit `ReporterPlatformViewV1` avec `version`, `engine`, `run` (seed + registryFingerprint + coverage metadata stable-sort selectedOperations) et `metrics` dérivées. (2) Pour `metrics.repairUsageByMotif`, projeter `diag.metrics.repairUsageByMotif` en tri stable (canonPath??'' puis motifId) et appliquer invariants (non-négatif, itemsWithRepair<=items, actions==0⇒itemsWithRepair==0). (3) Pour `metrics.coverage`, réduire le coverage-report en résumé: status/overall/byDimension/byOperation/thresholds/targetsByStatus + bloc `planning` issu de `diagnostics.plannerCapsHit` (totaux planned/unplanned + entries préservées). (4) Ajouter tests Vitest ciblés (`platform-view.test.ts`) couvrant: tri stable des motifs, respect des invariants (values clamp?), injection comparability (operationsScope/selectedOperations stable-sort), dérivation planning/plannerCapsHit depuis le fixture coverage-report. Mettre à jour le fixture si besoin pour inclure selectedOperations triées (pas de nouvelle sémantique). (5) Garder la vue pure et déterministe (pas d’horloge); aucune dépendance réseau/env; respecter “refonly surface” en ne modifiant pas diag/coverage d’origine. Boucler build → typecheck → lint → test → bench.

Risks/Unknowns:
- diag.metrics ne contient pas canonPath pour `repairUsageByMotif`; la vue devra accepter `canonPath` undefined tout en assurant un tri stable.
- Couverture “off” sans report: définir un comportement par défaut (mode=off, aucune couverture) sans inventer de ratios.
- Totaux planned/unplanned: vérifier que la réduction ne double-compte pas des tuples (dimension/scope).

Parent bullets couverts: [KR1, KR2, DEL1, DOD1, TS1]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true

Task: 9602   Title: Add observability regression tests for repair/G_valid metrics (subtask 9602.9602003)
Anchors: [spec://§2#observability-surfaces, spec://§10#repair-philosophy-observability, spec://§15#metrics, spec://§19#envelope, spec://§15#rng]
Touched files:
- packages/core/src/pipeline/__tests__/repair-observability.regression.test.ts

Approach:
Objectif: verrouiller par tests les invariants d’observabilité Repair/G_valid (metrics passives, diagnostics conformes, coverage-indépendance) sans modifier la logique Repair. (1) Introduire un test d’intégration pipeline `repair-observability.regression.test.ts` qui exécute `executePipeline` sur les micro-schemas G_valid/tiers existants avec seed fixe et `metrics: on`, `coverage: off/measure`, `dimensionsEnabled` variants. Utiliser `normalizePipelineResultForDeterminism` pour comparer outputs/diagnostics hors métriques et vérifier que `diag.metrics` gValid_* et `repair_tier*` restent stables et non négatifs. (2) Asserter que les diagnostics `REPAIR_TIER_DISABLED`/`REPAIR_GVALID_STRUCTURAL_ACTION` émis sont validés via `assertDiagnosticEnvelope`, et que les snapshots métriques reflètent les counters (gValid actions/items/itemsWithRepair, tierDisabled) pour les mêmes données. (3) Ajouter un scénario metrics toggle qui confirme que désactiver les métriques ne change ni outputs ni diagnostics, et que les compteurs sont nuls quand metrics off, tout en restant identiques entre deux runs metrics on. (4) Boucler build → typecheck → lint → test → bench, vérifier le respect du schéma diag et l’absence de dépendance au wall-clock/SLI (spec://§15#rng / metrics).

Risks/Unknowns:
- Potentiel bruit des timings/SLI dans `diag.metrics`; nécessité de filtrer via le helper de comparaison existant pour éviter le non-déterminisme.
- Risque de double comptage gValid/tierDisabled si les fixtures déclenchent plusieurs actions; calibrer les assertions pour des valeurs déterministes.
- Couverture measure vs off: s’assurer que le guidage coverage ne modifie pas les réparations sur ces fixtures; sinon ajuster le fixture pour neutraliser les hints.

Parent bullets couverts: [KR1, KR2, KR3, DEL3, DOD2, DOD3, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true

Task: 9602   Title: Add G_valid motif metrics to metrics collector (subtask 9602.9602001)
Anchors: [spec://§2#observability-surfaces, spec://§10#repair-philosophy-observability, spec://§15#metrics, spec://§19#envelope]
Touched files:
- packages/shared/src/types/diag.metrics.ts
- packages/core/src/util/metrics.ts
- packages/core/src/util/repair-usage-metrics.ts
- packages/core/src/repair/repair-engine.ts
- packages/core/src/diag/validate.ts
- packages/core/src/repair/__tests__/mapping-repair.test.ts (or new util test)

Approach:
Objectif: exposer les compteurs G_valid contractuels dans diag.metrics (`gValid_<motif>_{items,itemsWithRepair,actions}`) sans changer le flux Repair/Generator ni la couverture (`spec://§2#observability-surfaces`, `spec://§15#metrics`). Plan: (1) étendre le type DiagMetrics pour accepter des compteurs `gValid_*` optionnels et garder la validation diag permissive mais stricte sur les types (`spec://§19#envelope`). (2) Faire évoluer le collecteur de métriques/repair-usage pour incrémenter ces compteurs lorsqu’un item est classé G_valid (via `recordRepairUsageEvent`), en réutilisant les motifs existants (`GValidMotif` simpleObjectRequired / arrayItemsContainsSimple / apFalseMustCover / complexContains) et en conservant l’agrégat `repairUsageByMotif` pour la traçabilité. Items comptent toujours +1, `itemsWithRepair`/`actions` seulement si des actions sont appliquées; aucun effet en mode metrics off pour préserver la passivité (`spec://§10#repair-philosophy-observability`). (3) Ajouter un test ciblé (unit ou mapping-repair) qui déclenche un motif G_valid avec/ sans Repair et vérifie les compteurs `gValid_*` et la présence de repairUsageByMotif, plus la validation diag pour s’assurer que les nouveaux champs passent les contrôles. (4) Vérifier qu’aucune dépendance à coverage ou au mur du temps n’est introduite; re-exécuter la chaîne build → typecheck → lint → test → bench.

Risks/Unknowns:
- S’assurer que les noms de motifs utilisés pour les clés `gValid_*` correspondent bien aux valeurs `GValidMotif` (pas de casse ou renommage implicite).
- Les tests existants peuvent attendre `repairUsageByMotif` uniquement; veiller à ne pas casser leur structure en ajoutant les compteurs.
- Volume des actions: si une action carry un compteur >1, bien additionner `actions` même quand `itemsWithRepair` reste 0 pour un item sans actions.

Parent bullets couverts: [KR1, KR2, DOD2, DOD3, TS1]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true

Task: 9601   Title: Validate coverage-report/v1 schema with observability fields (subtask 9601.9601003)
Anchors: [spec://§2#observability-surfaces, cov://§5#coverage-report, cov://§7#thresholds]
Touched files:
- PLAN.md
- .taskmaster/docs/9601-traceability.md
- packages/reporter/src/schemas/coverage-report-v1.schema.json
- packages/shared/src/types/coverage-report.ts
- packages/reporter/test/coverage-diff.test.ts
- json-schema-reporter/test/coverage-report-schema.test.ts

Approach:
Objectif: garantir que le schéma coverage-report/v1 couvre les champs observabilité (plannerCapsHit, meta.planned:false, comparabilité) sans casser les consommateurs (`spec://§2#observability-surfaces`, `cov://§5#coverage-report`, `cov://§7#thresholds`). Plan: (1) aligner le schéma JSON `coverage-report-v1.schema.json` sur les structures actuelles (plannerCapsHit trié, meta.planned:false présent, diagnostics.notes éventuellement vides) et ajouter/resserrer les contraintes sur `run.dimensionsEnabled`, `run.excludeUnreachable`, `run.operationsScope/selectedOperations` (nullable/optional) et `metrics.thresholds.overall` conformément aux invariants cov://§7#thresholds. (2) Synchroniser les types partagés `CoverageReport`/`CoverageDiagnostics`/`PlannerCapHit` si des champs manquent (ex: optionalité de `operationsScope`, `selectedOperations`), en conservant la compatibilité runtime. (3) Étendre les tests reporter et le validateur schema (json-schema-reporter) pour valider un rapport synthétique contenant `plannerCapsHit` non vide et des targets avec `meta.planned:false`, plus comparabilité metadata, en veillant à ne pas toucher les snapshots existants hors scope. (4) Rejouer la chaîne build → typecheck → lint → test → bench, et mettre à jour traceability/DoD. Ne pas modifier la construction du rapport (déjà couverte en 9601.9601001), uniquement valider et typer.

Risks/Unknowns:
- Compatibilité avec snapshots reporter: ajouter de nouveaux champs pourrait nécessiter des updates ciblés; limiter l’impact en ajoutant un fixture dédié aux tests de schéma plutôt qu’en changeant les snapshots existants.
- Diff entre types shared et schéma reporter: vérifier l’alignement avant de resserrer les validations pour éviter des ruptures inattendues.
- operationsScope/selectedOperations optionnels: clarifier si null/undefined sont acceptés; choisir une politique stricte (undefined) cohérente avec les rapports actuels.

Parent bullets couverts: [KR3, DEL3, DOD1, DOD2, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true

Task: 9601   Title: Emit and enforce comparability metadata for diffs (subtask 9601.9601004)
Anchors: [spec://§2#observability-surfaces, spec://§7#platform-kpis-gates, cov://§5#coverage-report, cov://§7#thresholds]
Touched files:
- PLAN.md
- .taskmaster/docs/9601-traceability.md
- packages/shared/src/coverage/index.ts
- packages/shared/src/types/coverage-report.ts
- packages/core/src/pipeline/orchestrator.ts
- packages/core/src/coverage/runtime.ts
- packages/core/src/coverage/diff.ts
- packages/core/src/coverage/__tests__/coverage-diff.spec.ts
- packages/reporter/src/schemas/coverage-report-v1.schema.json
- packages/reporter/test/fixtures/coverage-report.v1.sample.json

Approach:
Objectif: propager et faire respecter les métadonnées de comparabilité (registryFingerprint, operationsScope, selectedOperations) dans coverage-report/v1 et le diff tooling, en rejetant les diffs incompatibles (`spec://§2#observability-surfaces`, `spec://§7#platform-kpis-gates`, `cov://§5#coverage-report`, `cov://§7#thresholds`). Plan: (1) étendre les types/ schémas (shared + reporter) pour inclure `run.registryFingerprint` et rendre explicite `operationsScope/selectedOperations`, en gardant la compatibilité avec les rapports existants (valeurs par défaut `all`/undefined, fingerprint `'0'`). (2) Injecter ces champs dans la construction du coverage report (orchestrator/runtime) en réutilisant le fingerprint résolveur calculé en Compose et en stabilisant les valeurs par défaut (scope all, selectedOperations normalisées). (3) Renforcer `checkCoverageDiffCompatibility` pour comparer le fingerprint (normalisé) et conserver le rejet scope sélectionné mismatch, avec un test dédié (case mismatch fingerprint) dans `coverage-diff.spec.ts`. (4) Mettre à jour le fixture schema reporter pour refléter fingerprint/opsScope, puis rejouer build → typecheck → lint → test → bench et trace/DoD. Pas d’I/O réseau ni de changement pipeline, uniquement métadonnées et compatibilité diff.

Risks/Unknowns:
- La source de `operationsScope/selectedOperations` n’est pas encore instrumentée côté pipeline; je vais utiliser des valeurs par défaut stables (all/undefined) pour éviter des faux rejets jusqu’à ce que l’origine soit disponible.
- En ajoutant registryFingerprint au rapport, il faut éviter de rendre la comparaison floconneuse si l’un des rapports est ancien; normaliser à `'0'` en absence pour maintenir la compatibilité.
- Les schémas reporter peuvent nécessiter des mises à jour de snapshots si des champs supplémentaires apparaissent; limiter l’impact aux fixtures dédiées.

Parent bullets couverts: [KR4, DEL3, DOD3, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true

Task: 9601   Title: Tag planned/unplanned targets under planner caps (subtask 9601.9601001)
Anchors: [spec://§2#observability-surfaces, cov://§4#coverage-planner, cov://§5#coverage-report]
Touched files:
- PLAN.md
- .taskmaster/docs/9601-traceability.md
- packages/core/src/coverage/runtime.ts
- packages/core/src/coverage/__tests__/coverage-report-json.test.ts
- packages/core/src/coverage/__tests__/coverage-runtime.test.ts

Approach:
Pour cette sous-tâche, je dois garantir que les caps du planner restent visibles côté `coverage-report/v1` : toutes les cibles dépriorisées doivent être matérialisées dans `targets[]`/`uncoveredTargets[]` avec `meta.planned:false`, et `diagnostics.plannerCapsHit` doit agréger (dimension, scopeType, scopeKey) avec `totalTargets/plannedTargets/unplannedTargets` de façon stable et déterministe (`spec://§2#observability-surfaces`, `cov://§4#coverage-planner`, `cov://§5#coverage-report`). Plan: (1) relire le flux `planCoverageForPipeline` → `evaluateCoverageAndBuildReport` pour vérifier où `plannerCapsHit` et `meta.planned:false` peuvent être perdus (reportMode summary, tri uncovered, clonage des targets) et ajouter si besoin un tri/deduplication déterministe des entrées `plannerCapsHit` aligné sur la spec. (2) Ajouter un test d’intégration dans `coverage-report-json.test.ts` qui lance `executePipeline` en `coverage=guided` avec caps serrés (per-dimension + per-schema) et contrôle que le rapport final contient les cibles non planifiées (mêmes IDs qu’avant caps) marquées `planned:false`, que `plannerCapsHit` contient les agrégats attendus et que `uncoveredTargets` reste aligné avec ces flags. (3) Compléter `coverage-runtime.test.ts` avec un cas unitaire sur `planCoverageForPipeline` qui compare nombre de cibles marquées `planned:false` au total `unplannedTargets` des diagnostics, pour verrouiller l’invariant sans passer par le pipeline complet. (4) Créer/mettre à jour `9601-traceability` pour tracer KR/TS/DoD spécifiques à la visibilité caps.

Risks/Unknowns:
- Fragilité des snapshots si l’ordre des targets/diagnostics n’est pas stabilisé; nécessitera peut-être un tri explicite.
- Les caps dimension/schema/operation peuvent produire plusieurs entrées par dimension; il faut éviter les doublons ou l’ordre non déterministe.
- Les tests end-to-end peuvent être coûteux si le schéma d’essai génère trop de cibles; choisir un fixture minimal mais couvrant branches/ops.

Parent bullets couverts: [KR1, DEL1, TS1, DOD1]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true

Task: 9600   Title: Align diag.metrics baseline with observability spec — subtask 9600.9600004
Anchors: [spec://§2#observability-surfaces, spec://§15#metrics, spec://§15#rng, spec://§19#envelope]
Touched files:
- PLAN.md
- .taskmaster/docs/9600-traceability.md
- packages/core/test/util/determinism-compare.ts
- packages/core/src/pipeline/__tests__/metrics-toggle.integration.test.ts

Approach:
Pour la sous-tâche 9600.9600004, je dois fournir un comparateur de déterminisme qui ignore explicitement les métriques non déterministes (timings + SLIs p50/p95/memory) afin que les tests metrics-on/off et futurs diffs ne déclenchent pas de faux positifs tout en restant stricts sur les artefacts fonctionnels. En m’appuyant sur `spec://§2#observability-surfaces`, `spec://§15#metrics`, `spec://§15#rng` et `spec://§19#envelope`, je vais (1) créer un utilitaire `packages/core/test/util/determinism-compare.ts` qui normalise un `PipelineResult` en supprimant les diagnostics metrics et en filtrant les clés métriques non déterministes, tout en conservant les artefacts générés/réparés et les diagnostics structurés ; les compteurs déterministes resteront disponibles quand on active explicitement la comparaison des métriques, (2) refactorer le test metrics-toggle pour s’appuyer sur ce helper, en forçant la comparaison des sorties/diagnostics sans tenir compte des métriques (puisque l’instrumentation on/off produit des valeurs différentes) et en gardant des assertions ciblées sur le snapshot metrics (zéros quand disabled, ≥0 quand enabled, SLIs toujours à 0 en runtime), et (3) rejouer build → typecheck → lint → test → bench pour vérifier que le helper ne casse pas la suite et reste aligné avec le contrat observabilité passive. Je mettrai à jour la trace 9600 pour indiquer la couverture de KR3/DEL3/TS3 côté comparator, et je noterai tout besoin futur de filtrage additionnel si de nouveaux champs non déterministes apparaissent.

Risks/Unknowns:
- Scope du helper : décider s’il doit ignorer uniquement SLIs/timings ou toute clé inconnue en metrics pour éviter d’absorber des régressions ; viser une liste blanche minimaliste.
- Risque de masquage : le nettoyage doit cibler metrics/SLIs mais conserver les détails diagnostics pour ne pas cacher des divergences fonctionnelles.
- Tri/ordre des diagnostics : s’assurer que le helper n’introduit pas de tri non spécifié qui masquerait un ordre déterministe attendu.

Parent bullets couverts: [KR3, DEL3, DOD2, DOD3, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true

Task: 9603   Title: Add resolver observability tests (online/offline/cache) (subtask 9603.9603003)
Anchors: [spec://§2#observability-surfaces, spec://§6#phases, spec://§15#rng, spec://§19#envelope]
Touched files:
- PLAN.md
- .taskmaster/docs/9603-traceability.md
- packages/core/src/pipeline/__tests__/resolver-diag.integration.test.ts
- packages/core/src/pipeline/__tests__/resolver-observability.integration.test.ts

Approach:
Je dois prouver que les diags run-level du resolver sont déterministes et présents sur les profils online/offline/cache sans modifier le flux pipeline (`spec://§6#phases`) ni la sortie fonctionnelle (`spec://§15#rng`). Plan: (1) ajouter un test d’intégration dédié `resolver-observability.integration.test.ts` avec trois scénarios: (a) offline/local-only avec `$ref` externe et `stubUnresolved:'emptySchema'` pour vérifier `RESOLVER_STRATEGIES_APPLIED`, `RESOLVER_OFFLINE_UNAVAILABLE` et `EXTERNAL_REF_STUBBED` tous en `diag.run`/warn canonPath `#`; (b) exécuter un “cache miss fetched” en mockant `fetch` (allowHosts ciblé) pour servir un petit schéma JSON dans un cacheDir temporaire, attendre `RESOLVER_CACHE_MISS_FETCHED` + fingerprint, puis rerun avec le même cache pour observer `RESOLVER_CACHE_HIT` et s’assurer que `fetch` n’est plus appelé; (c) vérifier que `registryFingerprint` reste identique entre miss/hit et que l’ensemble des diag.run conserve canonPath `#` et ordre stable (trié pour l’assertion) en respectant le schéma (`spec://§19#envelope`). (2) Factoriser au besoin des helpers communs dans `resolver-diag.integration.test.ts` pour éviter la duplication de schémas/expectations. (3) Rejouer build → typecheck → lint → test → bench et mettre à jour traceability + DoD.

Risks/Unknowns:
- Mock fetch: éviter tout appel réseau réel et restaurer `globalThis.fetch` entre tests.
- CacheDir temporaire: bien isoler/clean pour que les assertions miss→hit restent déterministes.
- Ordre des diags: stabiliser les assertions (tri par code) pour éviter des snapshots fragiles.

Parent bullets couverts: [KR2, KR3, DEL3, DOD2, DOD3, TS2, TS3]

DoD checklist:
- [x] Tests couvrent offline/no-strategy avec diag.run (strategies + offline + stubbed) canonPath '#'.
- [x] Tests couvrent cache miss→hit deterministe avec registryFingerprint identique et fetch non rappelé en hit.
- [x] Chaîne build→typecheck→lint→test→bench rejouée, diag-schema respecté.

Task: 9603   Title: Emit resolver diagnostics in Compose pipeline (subtask 9603.9603002)
Anchors: [spec://§2#observability-surfaces, spec://§6#phases, spec://§15#rng, spec://§19#envelope]
Touched files:
- PLAN.md
- .taskmaster/docs/9603-traceability.md
- packages/shared/src/types/diag.resolver.ts
- packages/core/src/pipeline/orchestrator.ts
- packages/core/src/resolver/options.ts
- packages/core/src/diag/schemas.ts
- packages/core/src/diag/__tests__/envelope.test.ts
- packages/core/src/pipeline/__tests__/resolver-diag.integration.test.ts
- packages/core/src/pipeline/__tests__/pipeline-stub-unresolved.integration.test.ts
- packages/reporter/test/__snapshots__/reporter.snapshot.test.ts.snap
- .taskmaster/tasks/tasks.json

Approach:
Je dois câbler l’extension resolver pour que ses diagnostics (strategies, cache hit/miss, offline, unresolved/stubbed) arrivent systématiquement dans `compose.diag.run` sans changer le flux pipeline (`spec://§6#phases`) ni la sortie fonctionnelle (`spec://§15#rng`). Plan: (1) cartographier le flux actuel `resolveAllExternalRefs` → `resolverRunDiags` → `composeResult.diag.run` pour identifier les cas non couverts (ex: stubbed/unresolved pré-compose, fingerprint absent) et décider où injecter des entrées run-level supplémentaires ou enrichies (`spec://§2#observability-surfaces`). (2) Étendre les détails `ResolverStrategiesApplied` pour transporter `registryFingerprint` et, si nécessaire, ajouter/recadrer les notes pour offline/cache/unresolved afin qu’elles soient émises en phase Compose avec canonPath `#` et payloads conformes aux schémas (`spec://§19#envelope`), tout en gardant l’observabilité passive (aucune décision de fetch/validation ne change). (3) Mettre à jour l’orchestrateur pour attacher ces notes de façon déterministe (ordre stable) et ajuster le test d’intégration resolver pour vérifier au moins la présence de la note strategies+fingerprint et l’injection run-level sans rompre les scénarios offline/cache (les tests de couverture online/offline/cache complets arriveront dans 9603.9603003). Vérifier que rien n’introduit de dépendance à l’horloge ni de divergence metrics on/off.

Risks/Unknowns:
- Ordonnancement des run diags: s’assurer que l’ajout de nouvelles entrées ne rend pas les snapshots instables ou non déterministes.
- Exposition `registryFingerprint`: décider si on l’inclut dans la note strategies vs note dédiée; éviter de fuiter des chemins sensibles (cacheDir déjà anonymisé).
- Double émission stubbed/unresolved (run vs warn) ou changement de statut pipeline si la validation diag échoue; prévoir un garde-fou dans les tests.

Parent bullets couverts: [KR1, KR2, KR3, DEL2, DOD1, DOD2, TS2]

DoD checklist:
- [x] Diagnostics resolver (strategies/cache/offline/unresolved) émis dans `diag.run` avec canonPath '#' et phase Compose.
- [x] `registryFingerprint` exposé dans les diags run-level ou metadata sans altérer le flux ni la déterminisme.
- [x] Test(s) exercant l’émission run-level (stratégies + offline/cache) et passage diag-schema.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true

Task: 9602   Title: Harden repair tier counters and diagnostics (subtask 9602.9602002)
Anchors: [spec://§2#observability-surfaces, spec://§10#repair-philosophy-observability, spec://§15#metrics, spec://§19#envelope]
Touched files:
- packages/core/src/diag/schemas.ts
- packages/core/src/diag/__tests__/diag-codes.test.ts
- packages/core/src/repair/__tests__/mapping-repair.test.ts
- .taskmaster/docs/9602-traceability.md

Approach:
Objectif: rendre robustes les compteurs de tiers et les diagnostics de blocage selon la spec Repair (`spec://§10#repair-philosophy-observability`) sans modifier le flux Repair/coverage (`spec://§2#observability-surfaces`). Plan: (1) durcir le schéma diag pour `REPAIR_GVALID_STRUCTURAL_ACTION`/`REPAIR_TIER_DISABLED` en exigeant les champs observabilité (keyword/kind/strategy, optional missing/deficit) et vérifier via `assertDiagnosticEnvelope` (`spec://§19#envelope`). (2) S’assurer que la collecte de métriques `repair_tier{1,2,3}_actions`/`repair_tierDisabled` reste alignée avec les diagnostics: ajouter un test d’intégration `repair-tier-policy` qui déclenche un blocage de policy (G_valid structural) et vérifie à la fois la présence des diagnostics et l’incrément des compteurs (`spec://§15#metrics`). (3) Harmoniser le runtime pour peupler les diagnostics avec des champs attendus (ex: tier/g_valid reason) sans changer la décision de Repair; la collecte reste passive et indépendante de coverage. (4) Rejouer build → typecheck → lint → test → bench; valider diag-schema. Pas d’I/O ni dépendance wall-clock ajoutées.

Risks/Unknowns:
- Détails diag actuels pour `REPAIR_GVALID_STRUCTURAL_ACTION` varient selon keyword; la forme du schéma doit accepter les variantes (required/minItems) sans être trop lâche.
- S’assurer que les tests existants (gValid structural, tier policy) ne deviennent pas fragiles avec des assertions plus strictes sur les payloads.
- Comptage tierDisabled vs g_valid guard: vérifier que l’incrément reflète bien les policy blocks sans double comptage.

Parent bullets couverts: [KR1, DEL1, DEL2, DOD1, TS2]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
Task: 9603   Title: Register resolver diagnostics codes and schema (subtask 9603.9603001)
Anchors: [spec://§2#observability-surfaces, spec://§6#phases, spec://§15#rng, spec://§19#envelope]
Touched files:
- PLAN.md
- .taskmaster/docs/9603-traceability.md
- packages/shared/src/types/diag.resolver.ts
- packages/shared/src/index.ts
- packages/core/src/diag/codes.ts
- packages/core/src/diag/schemas.ts
- packages/core/src/diag/validate.ts
- packages/core/src/pipeline/orchestrator.ts
- packages/core/src/resolver/options.ts
- packages/core/src/resolver/http-resolver.ts
- packages/core/src/diag/__tests__/envelope.test.ts

Approach:
Je dois aligner les diagnostics run-level du resolver (cache hits/misses, offline, strategies, external refs) avec les surfaces observabilité et le schéma d’enveloppe (`spec://§2#observability-surfaces`, `spec://§19#envelope`) sans introduire de non-déterminisme (`spec://§15#rng`) ni changer la phase (`spec://§6#phases`). Je vais d’abord inventorier les payloads émis aujourd’hui par `resolveAllExternalRefs` et le HTTP resolver pour documenter les champs (requested vs effective strategies, snapshotPath, alias, limits/reasons) puis créer un module partagé `diag.resolver.ts` qui type les entrées `diag.run` (discriminated union par code, canonPath figé à '#', phase Compose). Ensuite, j’élargirai/resserrerai `DIAGNOSTIC_CODES`, `DIAGNOSTIC_DETAIL_SCHEMAS` et l’allow-list des phases pour ces codes afin que `assertDiagnosticEnvelope` puisse valider les détails run-level et détecter les incohérences (ex: missing ref/contentHash, reason non admis). Enfin, j’ajouterai une validation explicite des `diag.run` dans `diag/validate` (et/ou dans l’orchestrateur) en réutilisant les helpers existants, plus des tests ciblés qui couvrent des payloads valides/invalides, garantissent le canonPath '#', et vérifient que le binding de phase ne rejette pas les autres diagnostics Compose.

Risks/Unknowns:
- Risque d’expressivité des schémas: il faut accepter les champs optionnels déjà émis (alias, requested, snapshotPath, limit/error) sans ouvrir la porte à des payloads trop lâches.
- Où accrocher la validation `diag.run` sans perturber les diagnostics plan/coverage existants; possible duplication avec la phase Compose.
- S’assurer que l’ajout de types partagés ne casse pas la consommation actuelle côté reporter/tests (runtime doit rester inchangé).

Parent bullets couverts: [KR1, DEL1, DOD1, TS1]

DoD checklist:
- [x] Codes resolver présents dans l’allow-list phase Compose et schémas alignés avec les payloads émis.
- [x] `diag.run` validé (enveloppe + canonPath '#') sans effets sur le flux pipeline.
- [x] Tests ajoutés pour les schémas resolver et passés.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
