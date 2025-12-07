Task: 9507   Title: Document simple.json repair baseline and verify spec alignment (9507.5)
Anchors: [spec://§10#commit-rule, spec://§15#metrics, cov://§4#coverage-independence]
Touched files:
- packages/core/test/e2e/coverage-simple-profile.regression.test.ts
- PLAN.md

Approach:
Pour parent task 9507 et la sous-tâche 9507.5, compléter la documentation autour de `profiles/simple.json` directement dans le fichier de tests `packages/core/test/e2e/coverage-simple-profile.regression.test.ts`. Ajouter un bloc de commentaire structuré en tête du `describe` qui résume: (1) les caractéristiques du schéma simple (conditional `if/then` sur kind=service/metadata.tier, `contains` sur tags, `uniqueItems`, AP:false, dependentRequired), (2) pourquoi ce profil sert de banc d’essai pour la philosophie Repair (plusieurs motifs Tier-1/Tier-2 exercés, interaction avec la commit rule Score), (3) les attentes de base après 9503/9507 (guided: run vert, metadata.tier réparé; coverage=off vs measure: artefacts Repair identiques; distributions de métriques cohérentes avec §15). Vérifier que les tests existants (guided, coverage-independence, déterminisme, baseline métriques) sont alignés avec ces attentes et qu’ils ne violent pas les invariants SPEC (Score/commit rule, coverage-independence, métriques). Mettre à jour si besoin les noms de tests ou commentaires pour pointer vers les anchors pertinents, sans ajouter de logique d’exécution nouvelle.

Risks/Unknowns:
- Veiller à ce que les commentaires restent REFONLY (anchors, pas de prose copiée du spec) et ne se désynchronisent pas avec `docs/spec-canonical-json-schema-generator.md` ou `docs/spec-coverage-aware-v1.0.md`.
- Ne pas transformer ce test en documentation monolithique: garder une description concise mais suffisante pour comprendre l’intention de chaque scénario et son lien avec la Repair philosophy.
Parent bullets couverts: [KR3, DEL3, DOD3, TS3]

DoD:
- [ ] Bloc de documentation ajouté en tête de `coverage-simple-profile.regression.test.ts` décrivant le rôle de simple.json comme profil de référence pour la Repair philosophy et renvoyant vers les anchors SPEC pertinents.
- [ ] Revue des tests existants confirmant qu’ils sont cohérents avec Score/commit rule, coverage-independence et les objectifs de métriques; commentaires ajustés si nécessaire.
- [ ] build/typecheck/lint/test/bench OK
- [ ] Traceability updated for 9507 et 9507.5

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
