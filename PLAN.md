Task: 9600   Title: Align diag.metrics baseline with observability spec — subtask 9600.9600003
Anchors: [spec://§2#observability-surfaces, spec://§15#metrics, spec://§15#rng, spec://§19#envelope]
Touched files:
- PLAN.md
- .taskmaster/docs/9600-traceability.md
- packages/core/src/pipeline/__tests__/metrics-toggle.integration.test.ts

Approach:
Pour la sous-tâche 9600.9600003, je vais ajouter un test d’intégration pipeline qui exécute `executePipeline` sur un schéma fixe (seed/options identiques) avec `metrics.enabled` true vs false et démontre que tous les artefacts déterministes (items générés/réparés, actions de repair, diagnostics codes/paths) restent identiques en ignorant seulement les champs de métriques/SLI. En m’appuyant sur `spec://§2#observability-surfaces`, `spec://§15#metrics`, `spec://§15#rng` et `spec://§19#envelope`, j’écrirai un helper de comparaison qui supprime `metrics` des enveloppes diag et du résultat global avant comparaison profonde, puis j’asserterai que les diagnostics éventuels restent inchangés (codes/paths/détails) et que les branches générées ne varient pas. Je vérifierai aussi que le snapshot metrics en mode off reste nul (zéros stables) tandis que le mode on contient des compteurs/timings non négatifs, sans SLIs (enableSlis=false par défaut). Le test utilisera un schéma simple et `validateFormats:false` pour éviter des dépendances externes. Une fois le test ajouté, je rejouerai build → typecheck → lint → test → bench pour garantir l’absence de régressions et je mettrai à jour la trace 9600.

Risks/Unknowns:
- Comparaison des diagnostics : veiller à ne pas considérer l’absence/presence de `metrics` comme un diff fonctionnel ; le helper doit nettoyer profondément.
- S’assurer que le schéma choisi n’introduit pas de diagnostics non déterministes (ex : coverage-guided) pour éviter des faux positifs.
- Les métriques runtime pourraient être toutes nulles en mode off : vérifier que les assertions restent stables sur CI.

Parent bullets couverts: [KR2, DEL2, DOD2, TS2]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
