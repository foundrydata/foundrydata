Voici le **prompt modifié “spec-only”** prêt à copier-coller.

---

# Évaluer la viabilité d’une spécification — **SPEC-ONLY (sans mesures d’implémentation)**

**But.** Attribuer une **note de viabilité** à la spécification, centrée sur son périmètre fonctionnel (JSON Schema, AJV v8, pipeline **Normalize→Compose→Generate→Repair→Validate**, déterminisme, diagnostics, budgets/caps) **en se basant uniquement sur le contenu explicite de la spec**.
**Interdits :** ne pas utiliser de mesures d’exécution, benchmark, perf mémoire, ni d’informations externes. Ne pas inférer au-delà de ce qui est écrit.

**Interprétation “spec-only”.**

* Quand un critère mentionne des SLO/SLI (p95, mémoire, validations/row, etc.), **noter la présence, la clarté et le caractère normatif** (gates, protocoles, diagnostics) **dans la spec**, **pas** leur respect empirique.
* Citer les sections/paragraphes de la spec qui fondent la note (ex. « §13 »).
* Aucune navigation web, aucun run, aucun échantillonnage requis.

---

## 1) Structure de la note

* **Garde-fous (Hard gates)** — blocants. S’ils échouent, **viabilité = “Non viable”** sans calcul de score.
* **Score pondéré (0–100)** — somme des critères mesurables *au niveau texte de la spec* (voir §3).
* **Qualification finale**

  * **≥ 85** : Viable
  * **70–84** : Viable avec réserves
  * **55–69** : Viabilité conditionnelle
  * **< 55** : Faible viabilité
  * **Non viable** : au moins un garde-fou échoue

> Échelle par critère : 0–5 points, convertie via le poids.

---

## 2) Garde-fous (à passer impérativement) — **lecture de la spec uniquement**

1. **Validation AJV sur le schéma original (oracle)**
   *Attendu (spec-only)* : la spec stipule explicitement que chaque instance générée est validée par **AJV sur le schéma original** (pas sur des vues internes) et que l’échec invalide le pipeline.
   *Décision :* oui / non + référence(s) §.

2. **Zéro I/O pour `$ref` externes**
   *Attendu (spec-only)* : la spec interdit toute I/O réseau/FS, définit le traitement `EXTERNAL_REF_UNRESOLVED` (Strict = error, Lax = warn).
   *Décision :* oui / non + §.

3. **Gate AJV (mêmes flags, `unicodeRegExp:true`)**
   *Attendu (spec-only)* : la spec définit une **vérification au démarrage** des deux instances AJV et un échec dur `AJV_FLAGS_MISMATCH` en cas de divergence (dont `unicodeRegExp:true`).
   *Décision :* oui / non + §.

4. **Déterminisme local**
   *Attendu (spec-only)* : RNG local seedé, pas d’état global, stabilité documentée de `diag.chosenBranch`, `scoreDetails.tiebreakRand` et de l’instance pour `(seed, AJV.major, flags, options)` constants.
   *Décision :* oui / non + §.

5. **`AP:false` + patterns non ancrés**
   *Attendu (spec-only)* : en Strict, fail-fast `AP_FALSE_UNSAFE_PATTERN` (payload normé avec `sourceKind`), en Lax warn + exclusion conservative, exception pour `propertyNames.pattern` brut.
   *Décision :* oui / non + §.

---

## 3) Critères pondérés (poids → 100) — **évaluation “spec-only”**

> Pour chaque critère : noter 0–5 **selon la qualité/complétude normative dans la spec**, pas selon des résultats d’exécution.

### A. Correctitude fonctionnelle — **35 %**

* **A1. Must-cover sous `additionalProperties:false` — 15 %**
  *Spec-only :* définition rigoureuse (ancrage, cap regex, intersection multi-conjoncts, rôle de `propertyNames`, signal `PNAMES_REWRITE_APPLIED`), absence d’ambiguïté, diagnostics associés.
* **A2. Sac `contains` (allOf) + `uniqueItems` — 8 %**
  *Spec-only :* bag semantics, règles d’unsat et ordre déterministe (de-dup → re-satisfaction), diags.
* **A3. `oneOf`/`anyOf` : sélection & exclusivité — 6 %**
  *Spec-only :* scoring discriminant-first, Top-K / score-only, RNG seedé consigné, raffinement exclusif déterministe.
* **A4. Conditionnels “if-aware-lite” — 3 %**
  *Spec-only :* périmètre, biais minimal, diags `IF_AWARE_*`.
* **A5. Arithmétique `multipleOf` (rationnel + fallback) — 3 %**
  *Spec-only :* règles exactes, tolérance ε alignée, diags `RAT_*`.

### B. Observabilité & diagnostics — **15 %**

* **B1. Couverture des codes diag (§19) — 7 %**
  *Spec-only :* liste claire, enveloppe commune, mini-schémas de `details`.
* **B2. Schémas de `details` stables — 3 %**
  *Spec-only :* format normalisé, non-duplication de `canonPath` dans `details`.
* **B3. `ptrMap`/`revPtrMap` & `toOriginalByWalk` — 2 %**
  *Spec-only :* contrat et méthode documentés.
* **B4. Métriques — 3 %**
  *Spec-only :* champs exigés, définitions, où/Quand reportés (CI), sans exiger de valeurs.

### C. Performance & dégradations — **15 %** *(spécification des garanties, pas de mesures)*

* **C1. p95 latence de génération — 6 %**
  *Spec-only :* SLO chiffrés + protocole bench + **gates** normatifs et diags en cas de dépassement.
* **C2. Coûts de validation/réparation — 4 %**
  *Spec-only :* objectifs textuels (p50 validations/row, passes/row) et endroit où ils sont comptés.
* **C3. Dégradations contrôlées (caps) — 3 %**
  *Spec-only :* caps listés, effets prescrits (score-only, skip overlap…), codes associés.
* **C4. Empreinte mémoire p95 — 2 %**
  *Spec-only :* SLO mémoire + gate normatif et métriques correspondantes.

### D. Robustesse & erreurs — **15 %**

* **D1. Unsat précoces (sondes sûres) — 5 %**
  *Spec-only :* règles et limites (quand prouver vs hint).
* **D2. Réparation `propertyNames` — 5 %**
  *Spec-only :* renommage déterministe, garde must-cover, logging.
* **D3. `uniqueItems` + sac — 3 %**
  *Spec-only :* hash structural, re-satisfaction déterministe, ordre défini.
* **D4. Garde de stagnation/budget — 2 %**
  *Spec-only :* critères et diagnostic `UNSAT_BUDGET_EXHAUSTED`.

### E. Interop/drafts & réécritures — **10 %**

* **E1. Normalisation de draft (tuples, OAS `nullable`, exclusives) — 4 %**
* **E2. Réécriture `propertyNames` — 3 %**
* **E3. `$dynamic*` et refs externes — 3 %**

### F. Déterminisme & cache — **10 %**

* **F1. RNG & tie-break — 4 %**
* **F2. Clés de cache/mémo — 3 %**
* **F3. Indépendance horloge/locale — 3 %**

---

## 4) Règles de notation (0–5) — **adaptées “spec-only”**

* **5** : la spec couvre **exhaustivement** et **sans ambiguïté** le critère (règles normatives, exceptions, diagnostics, et/ou protocoles quand pertinent).
* **4** : ≥ 95 % couvert ; points mineurs non critiques ou clarifiables, diagnostics présents.
* **3** : ≥ 90 % couvert ; certaines zones grises/approximations explicitées.
* **2** : ≥ 75 % ; lacunes notables (préconditions manquantes, absence de diag, zones non normées).
* **1** : ≥ 60 % ; formulation vague/instable.
* **0** : < 60 % ou contradiction/hors périmètre.

> Pour les critères “perf/mémoire”, appliquer l’échelle à la **qualité des garanties écrites** (existence d’un SLO, protocole, gate, diag), **pas à des chiffres mesurés**.

---

## 5) Facteurs de pénalité (optionnels, max −10)

* **Ambiguïtés de spec non résolues** impactant la testabilité : −3.
* **`details` diag non normalisés** sur ≥ 3 codes majeurs : −3.
* **Absence d’API must-cover au Repair** (si la spec la requiert ailleurs) : −4.

---

## 6) Feuille de calcul (gabarit de sortie)

```
Garde-fous : [OK/KO]  → KO ⇒ Non viable

A1 ... F3 (0–5)  → pondération → sous-score
Somme pondérée → /100
Pénalités éventuelles → –X
Note finale → /100  → Qualification

Références : lister pour chaque item les §/paragraphes de la spec utilisés.
```

---

## 7) Consignes de sortie

* **Format** : tableau des garde-fous, tableau/synthèse des sous-scores, verdict final, **+ références précises à la spec** pour chaque décision.
* **Pas de mesures ni hypothèses d’implémentation**. Pas de contenu externe.
* **Clarté** : expliciter les exceptions/limites quand elles conditionnent la note.

---

## 8) Entrée attendue

* **SPECIFICATION A NOTER :** *(coller la spec ici, sans la réécrire dans la sortie)*

---
