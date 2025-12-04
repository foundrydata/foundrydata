Task: 9500   Title: Integrate Repair philosophy into canonical spec and align design docs — subtask 9500.9500002
Anchors: [spec://§10#repair-philosophy, spec://§10#mapping, spec://§6#generator-repair-contract, spec://§14#planoptionssubkey]
Touched files:
- PLAN.md
- .taskmaster/docs/9500-traceability.md
- .taskmaster/tasks/tasks.json
- docs/design-repair-philosophy.md

Approach:
Pour la sous-tâche 9500.9500002, je vais recentrer `docs/design-repair-philosophy.md` sur un rôle d’architecture/exégèse qui **référence** la SPEC canonique plutôt que de redéfinir des règles normatives en parallèle. En m’appuyant sur `spec://§10#repair-philosophy`, `spec://§10#mapping` et le contrat Generator/Repair de §6, je vais (1) ajouter dès l’introduction une mention explicite que la source normative unique pour tiers/policy/Score/budgets/G_valid est `docs/spec-canonical-json-schema-generator.md` (avec les anchors correspondants), (2) réécrire les sections “Repair Action Tiers”, “Interaction with Generator & G_valid”, “Budgets & Stagnation Guard” et “Observability & Testing” pour supprimer ou réduire les re-formulations de règles (MUST/SHOULD) qui dupliquent déjà §10.P1–10.P8, et les remplacer par des résumés non normatifs et des renvois clairs vers la SPEC, (3) conserver uniquement la plus-value design (exemples, rationales, suggestions de profils/tests) sans introduire de nouvelles obligations au-delà de la SPEC, et (4) vérifier que la nouvelle version ne contredit pas les invariants de coverage-indépendance, de Score/commit rule et de G_valid décrits dans la SPEC, puis relancer build/typecheck/lint/test/bench pour s’assurer que la doc reste cohérente avec l’implémentation.

DoD:
- [x] `docs/design-repair-philosophy.md` indique clairement dès le début que la SPEC canonique (§10 et §6/§14/§15) est la seule source normative pour la philosophie Repair (tiers, Score/commit rule, budgets, coverage-indépendance, G_valid), et renvoie vers les anchors correspondants.
- [x] Les sections de ce brief qui parlaient auparavant en termes de “MUST/SHOULD” pour des comportements déjà normés dans la SPEC sont reformulées en termes explicatifs (rationales, exemples, recommandations) sans contradiction ni nouvelle obligation implicite.
- [x] Les points de design spécifiques à FoundryData (profils éventuels, invariants de tests, suggestions de métriques) restent présents mais sont explicitement présentés comme non normatifs vis-à-vis de la SPEC, tout en alignant le vocabulaire avec `spec://§10#repair-philosophy`.
- [x] La suite build/typecheck/lint/test/bench reste verte après ces modifications, confirmant que `docs/design-repair-philosophy.md` est maintenant un surensemble explicatif de la SPEC plutôt qu’une deuxième définition normative.

Parent bullets couverts: [KR2, DEL2, DOD2, TS2]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
