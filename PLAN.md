Task: 9302   Title: Instrument generator for branches and enums
Anchors: [cov://§3#coverage-model, cov://§3#dimensions, cov://§4#generator-instrumentation, spec://§8#branch-selection, spec://§15#rng]
Touched files:
- packages/core/src/generator/foundry-generator.ts
- packages/core/src/generator/__tests__/coverage-branches-enum.test.ts

Approach:
Pour cette sous-tâche, je vais brancher l’instrumentation de couverture directement dans le générateur existant, en respectant les invariants de déterminisme et de neutralité décrits pour M0 (cov://§3#coverage-model, cov://§3#dimensions). Concrètement, j’étendrai `FoundryGeneratorOptions` avec un petit hook optionnel de couverture (mode + callback) qui sera consommé par `GeneratorEngine` sans modifier le contrat public de `generateFromCompose`. Dans `foundry-generator.ts`, j’ajouterai des helpers internes pour émettre des événements `CoverageEvent` typés `ONEOF_BRANCH`, `ANYOF_BRANCH`, `CONDITIONAL_PATH` et `ENUM_VALUE_HIT` avec des `canonPath` strictement canoniques (préfixés par `#`) et des `params` alignés sur les cibles produites par l’Analyzer (cov://§4#generator-instrumentation). Les événements de branches s’appuieront sur les pointeurs de branches déjà dérivés de la vue canonique (spec://§8#branch-selection), tandis que les événements d’enum seront émis au moment où une valeur d’`enum` est effectivement choisie, en retrouvant de façon déterministe l’index correspondant. L’implémentation sera purement passive : aucun nouvel appel RNG ne sera introduit et l’ordre des appels existants (xorshift32 / `tiebreakRand` per spec://§15#rng) restera inchangé afin de garantir que `coverage=measure` partage exactement le même flux d’instances que `coverage=off`. Les tests dédiés vérifieront que, pour des schémas simples `oneOf` / `anyOf` / `if/then/else` et `enum`, le générateur déclenche les bons événements avec les bons pointeurs lorsque le hook est activé, et qu’aucun événement n’est émis lorsque le mode de couverture est `off`.

Risks/Unknowns:
Les principaux risques concernent la cohérence fine entre les pointeurs utilisés par le générateur et ceux du CoverageGraph (especially branches vs opérateurs parents), ainsi que l’évolution future de l’intégration orchestrateur/accumulateur ; je limiterai donc l’API d’instrumentation à un callback minimal et vérifierai via les tests que les événements produits correspondent bien aux `CoverageTarget` attendus sur des cas représentatifs.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
