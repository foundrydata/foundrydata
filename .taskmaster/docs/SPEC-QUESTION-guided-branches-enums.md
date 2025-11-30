# SPEC Question
Anchor(s): ["cov://§3#coverage-model", "cov://§10#acceptance-criteria-v1", "spec://§8#branch-selection-algorithm"]

Symptôme:
Sur des schémas volontairement simples (un `oneOf` avec 3 branches d’objets disjoints, un objet avec `enum` de 4 valeurs), et pour un tuple fixé `(schema, options coverage, seed)` en `coverage=guided`, l’implémentation actuelle ne parvient pas à couvrir systématiquement toutes les cibles `ONEOF_BRANCH` / `ENUM_VALUE_HIT` même avec un budget raisonnable (par exemple `count` entre 12 et 48). Les cibles sont bien matérialisées dans `targets[]` avec la bonne dimension (`branches` / `enum`), mais plusieurs restent `hit:false` et les métriques `coverage.byDimension['branches']` / `coverage.byDimension['enum']` restent nettement inférieures à 1. Or §10 (cov://§10#acceptance-criteria-v1) formule les scénarios d’acceptance “OneOf branches” et “Enums” comme si un mode guided avec budget “suffisant” devait atteindre 100 % de hit pour ces cibles sur des schémas de ce type.

Impact:
Il existe un décalage entre (a) les garanties implicites de la SPEC pour `coverage=guided` sur les branches/enums simples et (b) le comportement effectif du planner/générateur piloté par les hints, tel qu’implémenté aujourd’hui. En pratique:
- les tests d’acceptance peuvent difficilement affirmer “tous les `ONEOF_BRANCH`/`ENUM_VALUE_HIT` sont hit” sans soit (i) rendre les tests extrêmement fragiles au moindre ajustement de budget/heuristiques, soit (ii) introduire du comportement spécial dans le moteur pour ces cas particuliers;
- inversement, si l’on assouplit la lecture de §10 pour accepter “couverture partielle mais diagnostic clair” sur branches/enums même pour des schémas simples, on risque de laisser des implémentations très conservatrices se revendiquer conformes alors qu’elles ne fournissent pas l’amélioration de couverture attendue en mode guided par rapport à `coverage=measure` (cov://§3#coverage-model, spec://§8#branch-selection-algorithm).
Ce flou rend difficile à la fois la rédaction de tests d’acceptance stables et l’évaluation de la conformité d’autres implémentations coverage-aware.

Proposition:
Clarifier explicitement, dans la SPEC, le niveau d’exigence pour `coverage=guided` sur les dimensions `branches` et `enum` dans le cas de schémas simples:
- soit **durcir le moteur comme la SPEC**: formaliser une exigence du type “pour tout schéma `oneOf` de taille ≤N sans contraintes bloquantes, et pour une plage de budget recommandée (par ex. `count∈[Kmin,Kmax]`), `coverage=guided` doit atteindre 100 % de hit sur les cibles `ONEOF_BRANCH` correspondantes, idem pour `ENUM_VALUE_HIT` sur des enums de taille ≤M”. Cela impliquerait de préciser dans §8 (spec://§8#branch-selection-algorithm) la stratégie de sélection de branches/valeurs en mode guided et d’aligner les implémentations existantes sur cette contrainte.
- soit **assouplir l’acceptance §10** en la reformulant de manière diagnostique: “guided doit (i) ne jamais régresser par rapport à `measure` sur `coverage.byDimension['branches'|'enum']`, (ii) maximiser la couverture dans la limite d’un budget documenté, et (iii) exposer clairement dans le rapport JSON quelles branches/valeurs restent `hit:false` et pourquoi (budget, `unreachable`, hints non satisfaits)”, sans promettre 100 % de hit même pour des schémas simples.

Recommandation pour V1:
Pour garder le caractère “acceptance” de §10 tout en restant réaliste vis-à-vis du moteur actuel, une option serait:
- de conserver la contrainte “guided ≥ measure” sur les métriques branches/enums (que l’implémentation respecte déjà), 
- d’ajouter une phrase non normative indiquant que, sur des schémas `oneOf`/`enum` “petits et réguliers”, une implémentation conforme devrait viser 100 % de couverture mais que cela n’est pas formellement exigible sans un profil de budget explicite,
- et de réserver une exigence forte “100 % de hit sous budget X” à un profil CLI dédié (par ex. un preset `thorough`) avec un budget documenté, plutôt qu’à la notion générale de “sufficient budget” actuellement implicite dans §10. Cela limiterait le risque de divergence entre implémentations tout en laissant la porte ouverte à un renforcement progressif du planner/générateur.

