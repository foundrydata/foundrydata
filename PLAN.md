Task: 9500   Title: Integrate Repair philosophy into canonical spec and align design docs — subtask 9500.9500003
Anchors: [spec://§10#repair-philosophy, spec://§19#envelope, spec://§19#payloads, spec://§15#metrics]
Touched files:
- PLAN.md
- .taskmaster/docs/9500-traceability.md
- .taskmaster/tasks/tasks.json
- docs/spec-canonical-json-schema-generator.md
- docs/tests-traceability.md

Approach:
Pour la sous-tâche 9500.9500003, je vais aligner la couche diagnostics/metrics et la matrice de traçabilité sur la nouvelle “Repair philosophy” canonique. En m’appuyant sur `spec://§10#repair-philosophy`, `spec://§19#envelope`, `spec://§19#payloads` et `spec://§15#metrics`, je vais (1) vérifier que les codes de diagnostics Repair introduits par la philosophie (notamment `REPAIR_TIER_DISABLED` et `REPAIR_REVERTED_NO_PROGRESS`) sont bien présents dans la table code↔phase de §19 et que leurs payloads sont correctement spécifiés, en les ajustant si besoin sans modifier d’autres phases, (2) documenter explicitement dans la section metrics que les compteurs `diag.metrics.repair_tier1_actions`, `repair_tier2_actions`, `repair_tier3_actions` et `repair_tierDisabled` sont les compteurs de référence pour les tiers Repair, alignés avec les invariants de determinism/coverage-indépendance de §10/§15, (3) compléter `docs/tests-traceability.md` avec une entrée “Repair philosophy / tiers & UNSAT” qui relie ces codes et métriques aux tests existants (unitaires/acceptance) qui les exercent, en explicitant les invariants attendus (par exemple, visibilité des blocages de tiers vs budgets, invariants G_valid), et (4) relancer build/typecheck/lint/test/bench pour vérifier que ces mises à jour de docs restent cohérentes avec l’implémentation et les schémas diagnostics existants.

DoD:
- [x] La table code↔phase de §19 et la section payloads explicitent les diagnostics Repair ajoutés par la philosophie (tier/policy, Score non-amélioré) avec des phases alignées sur la SPEC (phase `repair`) et des shapes `details` compatibles avec `diagnosticsEnvelope.schema.json`.
- [x] La section metrics documente les compteurs Repair relatifs aux tiers (`repair_tier1_actions`, `repair_tier2_actions`, `repair_tier3_actions`, `repair_tierDisabled`) comme instruments privilégiés pour observer l’application de la politique Repair, de manière cohérente avec les invariants de déterminisme et de coverage-indépendance.
- [x] `docs/tests-traceability.md` contient une ou plusieurs lignes dédiées à la “Repair philosophy” qui relient les diagnostics et métriques ci-dessus à des tests concrets (unitaires et/ou e2e) et décrivent les invariants attendus (différencier blocage de tier vs budget, comportement en zone G_valid, UNSAT/stagnation).
- [x] La suite build/typecheck/lint/test/bench reste verte après ces mises à jour, confirmant que la documentation diagnostics/metrics et la traçabilité restent alignées avec l’implémentation actuelle.

Parent bullets couverts: [KR3, DEL3, DOD3, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
