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
