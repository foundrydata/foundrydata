Task: 9309   Title: Add boundaries coverage dimension and instrumentation (M2)
Anchors: [cov://§3#coverage-model, cov://§4#boundaries, spec://§8#numbers-multipleof, spec://§8#early-unsat-checks]
Touched files:
- packages/core/src/coverage/coverage-analyzer-unreachable.ts
- packages/core/src/coverage/analyzer.ts
- packages/core/src/coverage/coverage-planner.ts
- packages/core/src/coverage/__tests__/analyzer.test.ts
- .taskmaster/docs/9309-traceability.md

Approach:
Pour 9309.9309003, je vais factoriser la logique de détection des chemins UNSAT et l’application des statuts `unreachable`/`deprecated` dans un module dédié `coverage-analyzer-unreachable`, puis l’utiliser depuis l’analyzer et le planner pour traiter proprement les cibles de frontières inatteignables (cov://§3#coverage-model, cov://§4#boundaries, spec://§8#early-unsat-checks). Ce module construira un ensemble de chemins UNSAT à partir des diagnostics Compose existants (y compris `UNSAT_NUMERIC_BOUNDS` et les gardes AP:false déjà utilisés pour la structure) et fournira une fonction pure qui, à partir d’une liste de CoverageTargets, marque comme `status:'unreachable'` toutes les cibles sous un chemin UNSAT (en conservant `SCHEMA_REUSED_COVERED` avec `status:'deprecated'`) tout en enrichissant `meta` avec des raisons de conflit. Dans `analyzer`, je remplacerai la logique inline par cet utilitaire afin que les cibles `boundaries` pour des domaines numériques ou de cardinalité vides héritent automatiquement du même traitement que les autres dimensions, sans ajouter de moteur de preuve supplémentaire. Dans `coverage-planner`, j’alignerai l’usage de `buildUnsatPathSet` sur ce nouveau module pour que la détection d’impossibilité de hints reste cohérente avec la notion de cibles inatteignables. Enfin, j’étendrai les tests d’analyzer pour couvrir explicitement les cibles de frontières sous `UNSAT_NUMERIC_BOUNDS` et vérifier que les targets `boundaries` deviennent `unreachable` sur les chemins concernés, tout en laissant les cas dégénérés `min == max` gérés de façon déterministe par l’instrumentation existante plutôt que par des heuristiques d’inatteignabilité.

Risks/Unknowns:
- La liste des codes UNSAT considérés comme “forts” doit rester alignée avec Compose; toute extension devra être tracée pour éviter de marquer à tort des cibles encore atteignables comme `unreachable`.
- La factorisation de la logique d’UNSAT entre analyzer et planner ne doit pas introduire de divergences subtiles (par exemple des chemins UNSAT traités différemment pour les cibles de structure et les cibles de frontières); des tests ciblés doivent vérifier que les deux couches voient les mêmes chemins UNSAT.
- Les traitements ultérieurs de 9309.9309004 sur les métriques by-dimension ne doivent pas supposer qu’aucune cible `boundaries` n’est marquée `unreachable`; cette sous-tâche doit donc se limiter au statut des cibles sans toucher au calcul des métriques.

Parent bullets couverts: [KR4, DEL3, DOD2, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
