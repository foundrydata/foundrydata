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
