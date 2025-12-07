Task: 9603   Title: Emit resolver diagnostics in Compose pipeline (bugfix pass)
Anchors: [spec://§2#observability-surfaces, spec://§6#phases, spec://§19#envelope, spec://§15#rng]
Touched files:
- packages/core/src/pipeline/orchestrator.ts
- packages/core/src/diag/__tests__/envelope.test.ts
- packages/core/src/pipeline/__tests__/resolver-diag.integration.test.ts
- packages/reporter/test/__snapshots__/reporter.snapshot.test.ts.snap

Approach:
Objectif: rétablir la conformité des diagnostics run-level resolver en ajoutant systématiquement le champ phase (compose) tout en conservant canonPath "#" et l’ordre déterministe (spec://§2#observability-surfaces, spec://§6#phases, spec://§19#envelope). (1) Centraliser la normalisation dans recordResolverRunDiag ou juste avant l’attachement à compose.diag.run pour forcer phase:'compose' sur toutes les notes resolver (y compris EXTERNAL_REF_UNRESOLVED/STUBBED remontées du pre-phase) sans modifier les détails ni l’ordonnancement; maintenir l’observabilité passive (spec://§15#rng). (2) Étendre les tests: envelope validator doit accepter des run diags avec phase explicite; les intégrations resolver doivent vérifier la présence du champ phase sur chaque note existante; mettre à jour le snapshot Reporter minimal reflétant la nouvelle clé, garantissant que la vue dérivée reste alignée sur la source diag. (3) Auto-review: run-level diags restent canonPath "#", aucune dépendance au temps/seed hors métriques, et determinism metrics on/off préservé. Chaîne de vérification complète build → typecheck → lint → test → bench pour respecter le DoD.

Risks/Unknowns:
- Éventuels snapshots ou assertions tolérantes ailleurs qui supposent l’absence de phase; contrôler les effets domino.
- Risque d’oublier des notes injectées hors du helper (ex: validation diagnostics combinées) si la normalisation n’est pas centralisée.
- S’assurer que l’ajout du champ ne change pas le tri stable ni l’égalité utilisée dans les comparateurs de déterminisme.

Parent bullets couverts: [KR1, KR2, KR3, DOD1, DOD2, TS1, TS2]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
