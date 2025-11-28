# Traceability — Task 9304 (Add CLI coverage modes, options and CI-friendly summary)

This document maps the parent task 9304 bullets from Implementation Details, Deliverables, Definition of Done and Test Strategy to its subtasks 9304.9304001–9304.9304004.

## Parent bullets

### Implementation Details

- [KR1] Implement CLI flags (`--coverage`, `--coverage-dimensions`, `--coverage-min`, `--coverage-report`, `--coverage-profile`, `--coverage-exclude-unreachable`) and map them to internal options and the CoverageReport.run fields.
- [KR2] Reuse `--n` / `--count` as `maxInstances` for `coverage=guided` and pass this bound through to the planner and coverage evaluator.
- [KR3] Provide a CI-friendly summary that prints `metrics.byDimension`, `metrics.byOperation`, `metrics.overall`, `targetsByStatus` and a short view of planner caps and unsatisfied hints, in that order of importance.
- [KR4] Ensure `coverage=off` behaves exactly as today with negligible overhead and that `coverage=measure` does not change generated instances for fixed seeds; pipeline wiring must not invoke CoverageAnalyzer or coverage instrumentation when coverage is off.
- [KR5] Implement coverage profiles (`quick`, `balanced`, `thorough`) as presets over `maxInstances`, `dimensionsEnabled` and planner caps with the ranges and behaviors described in the coverage-aware spec.
- [KR6] Guarantee that any future debug/introspection CLI option that materializes additional targets beyond `dimensionsEnabled` is explicit opt-in and never changes metric or threshold semantics: `coverage.overall`, `coverage.byDimension`, `coverage.byOperation` and `minCoverage` are always computed solely from dimensions listed in `dimensionsEnabled`.
- [KR7] Document coverage options and profiles in CLI help text and examples so that recommended usage and defaults stay aligned with the spec.

### Deliverables

- [DEL1] Extended CLI option parsing for coverage flags in the `generate` and `openapi` commands.
- [DEL2] Coverage summary printer module under `packages/cli/src/coverage/coverage-summary.ts`.
- [DEL3] Updated `--help` output and documentation snippets that demonstrate coverage modes, dimensions, thresholds, report path, profiles and excludeUnreachable options.

### Definition of Done

- [DOD1] The CLI accepts coverage flags and forwards them consistently to the core pipeline and coverage evaluator for JSON Schema and OpenAPI entrypoints.
- [DOD2] `coverage=off`, `coverage=measure` and `coverage=guided` map to the engine’s `coverageMode` field in the report and to whether CoverageAnalyzer/instrumentation are invoked, with `coverage=off` skipping coverage components entirely.
- [DOD3] Profiles `quick`, `balanced` and `thorough` map to well-defined presets for `maxInstances`, `dimensionsEnabled` and planner caps, and tests verify that selecting a profile yields the expected internal configuration.
- [DOD4] Summary output for representative runs shows per-dimension and per-operation coverage, overall coverage, `targetsByStatus` and concise planner/hints summaries, with per-dimension and per-operation displayed before the overall figure.
- [DOD5] CLI examples in README or dedicated docs demonstrate coverage usage patterns and remain in sync with the implemented flags and profiles.

### Test Strategy

- [TS1] CLI integration tests that run `foundrydata generate` and `foundrydata openapi` with different coverage flags and assert exit codes, coverage summary output and generated coverage-report JSON.
- [TS2] Tests that verify `coverage=off` does not trigger CoverageAnalyzer or coverage instrumentation.
- [TS3] Snapshot tests for the summary formatter to ensure ordering (`byDimension`, `byOperation`, `overall`) remains stable.
- [TS4] Tests that run the CLI with `--coverage-profile=quick|balanced|thorough` and assert that the resulting `dimensionsEnabled`, `maxInstances` and planner caps match the documented presets.

## Mapping 9304 subtasks → parent bullets

- **9304.9304001 – Add coverage flags to generate and openapi commands**  
  Covers: [KR1], [DEL1], contributes to [DOD1], [TS1]. Status: covered.

- **9304.9304002 – Map CLI coverage options to core pipeline configuration**  
  Covers: [KR2], [KR4], [KR5], [KR6], [DOD1], [DOD2], [DOD3], contributes to [TS1], [TS2], [TS4]. Status: covered.

- **9304.9304003 – Implement coverage summary printer for CI logs**  
  Covers: [KR3], [DEL2], [DOD4], [TS3]. Status: covered.

- **9304.9304004 – Add CLI tests for coverage modes and thresholds**  
  Covers: [DEL3], [DOD2], [DOD3], [DOD5], [TS1], [TS2], [TS3], [TS4]. Status: covered.

*** Update File: PLAN.md
@@
-Task: 9303   Title: Add snapshot tests for coverage-report/v1 JSON (subtask 9303.9303005)
-Anchors: [cov://§3#coverage-model, cov://§4#coverage-evaluator, cov://§7#json-coverage-report]
-Touched files:
-- packages/core/src/coverage/__tests__/evaluator.test.ts
-- packages/core/src/coverage/__tests__/coverage-report-json.test.ts
-
-Approach:
-Pour cette sous-tâche 9303.9303005, je vais ajouter des tests de snapshot qui valident la stabilité de la structure JSON et des valeurs clés du coverage-report/v1 produit par le pipeline, en particulier `metrics`, `dimensionsEnabled` et `metrics.targetsByStatus`. Je partirai des tests existants de `evaluateCoverage` dans `packages/core/src/coverage/__tests__/evaluator.test.ts` pour construire des scénarios représentatifs (dimensions multiples, `excludeUnreachable` vrai/faux, cibles `deprecated` de type SCHEMA_REUSED_COVERED) et j'ajouterai des assertions supplémentaires sur `metrics.targetsByStatus` et la cohérence entre `uncoveredTargets` et ces compteurs, conformément aux exigences de la tâche parente (DOD2, DOD5). En complément, je créerai un fichier de test dédié `coverage-report-json.test.ts` dans le même dossier, qui appellera la pipeline (ou un helper proche de la production du rapport) sur un petit ensemble de schémas de démonstration et fixera des snapshots JSON pour l'en-tête (version, reportMode, engine, run) et les structures `targets` / `uncoveredTargets`, en respectant les invariants `dimensionsEnabled` et `excludeUnreachable` (cov://§3#coverage-model, cov://§4#coverage-evaluator, cov://§7#json-coverage-report).
-
-Ces snapshots seront conçus pour être robustes face aux évolutions non significatives (par exemple en normalisant les timestamps ou en les remplaçant par des valeurs stables dans les fixtures) afin de garantir une détection fine des régressions de structure sans rendre les tests fragiles. Je m'assurerai que les tests couvrent à la fois `reportMode:'full'` et `reportMode:'summary'` au niveau du JSON final, et qu'ils vérifient l'absence d'effets indésirables de `dimensionsEnabled` sur les IDs de cibles (projection uniquement). Les snapshots et assertions explicites sur `metrics.targetsByStatus` permettront de marquer comme couverts les bullets parent [DOD2], [DOD5] et [TS5] dans la table de traçabilité, en documentant clairement le lien entre les fixtures, les dimensions actives et les compteurs par statut.
-
-Risks/Unknowns:
-Les principaux risques sont de rendre les snapshots trop fragiles vis-à-vis de détails non normatifs (timestamps, champs annexes destinés au debug) ou de figer des valeurs liées à l'aléa contrôlé (seed de RNG) au lieu de se concentrer sur la structure et les invariants métier. Il faudra aussi veiller à ne pas violer les invariants de gating coverage=off (aucun rapport produit dans ce mode) ni ceux de `dimensionsEnabled` et `excludeUnreachable` (projection uniquement, dénominateurs modifiés sans changer les IDs ni les statuts). Enfin, si la production du JSON passe par plusieurs couches (CoverageEvaluator, orchestrateur, API), il faudra choisir des points d'accroche de tests qui restent suffisamment proches de la production réelle sans dupliquer des tests déjà couverts par d'autres sous-tâches.
-
-Parent bullets couverts: [DOD2, DOD5, TS5]
-
-Checks:
-- build: npm run build
-- test: npm run test
-- bench: npm run bench
-- diag-schema: true
+Task: 9304   Title: Add coverage flags to generate and openapi commands (subtask 9304.9304001)
+Anchors: [cov://§6#execution-modes-ux, cov://§6#budget-profiles, cov://§7#cli-summary]
+Touched files:
+- packages/cli/src/index.ts
+- packages/cli/src/flags.ts
+- packages/cli/src/index.test.ts
+
+Approach:
+Pour cette sous-tâche 9304.9304001, je vais étendre le CLI `foundrydata` pour accepter explicitement les options de couverture décrites par les anchors cov://§6#execution-modes-ux et cov://§6#budget-profiles, en ajoutant les flags `--coverage`, `--coverage-dimensions`, `--coverage-min`, `--coverage-report`, `--coverage-profile` et `--coverage-exclude-unreachable` aux commandes `generate` et `openapi`. Côté implémentation, cela consiste à enrichir la définition des options dans `packages/cli/src/index.ts`, à mettre à jour l’interface `CliOptions` dans `packages/cli/src/flags.ts` pour typer ces nouveaux champs, et à s’assurer que la phase de parsing (`parsePlanOptions`) reçoit bien les valeurs brutes sans encore décider de la façon dont elles seront transmises à l’orchestrateur coverage-aware (qui sera traitée par la sous-tâche 9304.9304002). Je veillerai à respecter les invariants de déterminisme (pas de nouvelle source d’aléa) et à ne pas activer d’analyseur de couverture tant que la configuration interne n’est pas branchée, afin que `coverage=off` reste strictement équivalent au comportement actuel.
+
+Je compléterai les tests existants de `packages/cli/src/index.test.ts` par des cas ciblés qui vérifient que les nouvelles options sont acceptées par Commander (présence dans `--help`, absence d’erreur sur un appel basique avec `--coverage=off` et `--coverage-report`), sans encore valider la production d’un rapport coverage-report/v1. Cela permettra de garder une bonne couverture de `index.ts` et de `flags.ts` tout en laissant la logique de mapping détaillée (minCoverage, dimensionsEnabled, profils) au scope de 9304.9304002 et 9304.9304003. Les points d’intégration avec le reste du pipeline resteront strictement en lecture/forwarding de flags pour cette itération.
+
+Risks/Unknowns:
+Les principaux risques sont de définir des types ou des noms d’options qui ne s’aligneraient pas parfaitement avec la future configuration coverage (par exemple si les profils ou les dimensions évoluent dans la SPEC) et de créer une confusion UX si `--coverage=off` interagit mal avec d’autres flags existants. Il faudra aussi s’assurer que l’ajout de ces options n’introduit pas de rupture dans les usages existants (scripts CI basés sur `foundrydata generate` sans couverture) et garder à l’esprit que la validation fine de `minCoverage` et des profils sera couverte par les sous-tâches suivantes.
+
+Parent bullets couverts: [KR1, DEL1, DOD1, TS1]
+
+Checks:
+- build: npm run build
+- test: npm run test
+- bench: npm run bench
+- diag-schema: true
