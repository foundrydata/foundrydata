Attribuer une **note de viabilité** à la spécification, centrée sur son périmètre fonctionnel (JSON Schema, AJV v8, pipeline Normalize→Compose→Generate→Repair→Validate, déterminisme, diagnostics, budgets/caps) en fonction de la **rubrique de notation**  

---

## 1) Structure de la note

* **Garde‑fous (Hard gates)** — blocants. S’ils échouent, **viabilité = “Non viable”** sans calcul de score.
* **Score pondéré (0–100)** — somme de critères mesurables (voir §3).
* **Qualification finale**

  * **≥ 85** : Viable
  * **70–84** : Viable avec réserves
  * **55–69** : Viabilité conditionnelle
  * **< 55** : Faible viabilité
  * **Non viable** : au moins un garde‑fou échoue

> Échelle par critère : 0–5 points, convertie en pourcentage via le poids.

---

## 2) Garde‑fous (à passer impérativement)

1. **Validation AJV sur le schéma original** (oracle)
   *Mesure* : 100 % des cas “positifs” des suites passent la validation **source AJV**.
   *Attendu* : oui / non.

2. **Zéro I/O pour `$ref` externes**
   *Mesure* : aucune tentative d’accès réseau/FS, émission de `EXTERNAL_REF_UNRESOLVED` en Strict, warn en Lax.
   *Attendu* : oui / non.

3. **Gate AJV** (`unicodeRegExp:true` des deux côtés, flags de §13)
   *Mesure* : échec dur `AJV_FLAGS_MISMATCH` si divergence.
   *Attendu* : oui / non.

4. **Déterminisme local**
   *Mesure* : pour un triplet (seed, AJV.major, flags) constant, `diag.chosenBranch`, `scoreDetails.tiebreakRand` et l’instance générée sont stables.
   *Attendu* : oui / non.

5. **`AP:false` + patterns non ancrés**
   *Mesure* : en Strict, fail‑fast `AP_FALSE_UNSAFE_PATTERN` (avec `sourceKind`) ; en Lax, warn + exclusion conservative.
   *Attendu* : oui / non.

---

## 3) Critères pondérés (poids → 100)

### A. Correctitude fonctionnelle — **35 %**

A1. **Must‑cover sous `additionalProperties:false`** — *15 %*
*Mesure* : taux de cas corrects (couverture = `properties` ∪ patterns **anchored‑safe** ∪ PNAMES synthétiques si `PNAMES_REWRITE_APPLIED` ; PNAMES brut = gate only).
*0–5* : 0 = <60 % ; 3 = 90 % ; 5 = 100 %.

A2. **Sac `contains` (allOf) + `uniqueItems`** — *8 %*
*Mesure* : conformité des besoins `{schema,min,max}`, unsat `Σmin > maxItems` (disjoint) et re‑satisfaction après de‑dup.
*0–5* : idem.

A3. **`oneOf`/`anyOf`** — sélection et exclusivité — *6 %*
*Mesure* : scoring discriminant‑first, Top‑K, *score‑only* correctement tracé (`tiebreakRand`), raffinement excluant les autres branches.
*0–5*.

A4. **Conditionnels “if‑aware‑lite”** — *3 %*
*Mesure* : biais minimal cohérent (const/enum), diagnostics `IF_AWARE_*`.
*0–5*.

A5. **Arithmétique `multipleOf` (rationnel + fallback)** — *3 %*
*Mesure* : intersections exactes, ε d’acceptation aligné, diags `RAT_*`.
*0–5*.

### B. Observabilité & diagnostics — **15 %**

B1. **Couverture des codes diag (§19)** — *7 %*
*Mesure* : % de codes déclenchables ayant au moins un test qui confirme forme + payload.
*0–5*.

B2. **Schémas de `details` stables** — *3 %*
*Mesure* : conformité à un format documenté par code (ex. `sourceKind`, `canonPath`, etc.).
*0–5*.

B3. **`ptrMap`/`revPtrMap` & `toOriginalByWalk`** — *2 %*
*Mesure* : % de réparations loguées avec `origPath` correct.
*0–5*.

B4. **Métriques** — *3 %*
*Mesure* : présence cohérente de `validationsPerRow`, `repairPassesPerRow`, temps par phase, et compteurs d’usage.
*0–5*.

### C. Performance & dégradations — **15 %**

C1. **p95 latence de génération** — *6 %*
*Mesure* : ≤ 120 ms sur profils `simple/medium/pathological` (harness §15).
*0–5* : 5 = ≤ 120 ms ; 3 = ≤ 160 ms ; 0 = > 200 ms.

C2. **Coûts de validation/réparation** — *4 %*
*Mesure* : p50 `validationsPerRow ≤ 3`, `repairPassesPerRow ≤ 1` en P0.
*0–5*.

C3. **Dégradations contrôlées (caps)** — *3 %*
*Mesure* : activation de `COMPLEXITY_CAP_*` avec comportement conforme (skip‑trials, score‑only, etc.).
*0–5*.

C4. **Empreinte mémoire p95** — *2 %*
*Mesure* : ≤ 512 MB.
*0–5*.

### D. Robustesse & erreurs — **15 %**

D1. **Unsat précoces (sondes sûres)** — *5 %*
*Mesure* : exactitude de `UNSAT_*` (incl. `UNSAT_REQUIRED_AP_FALSE`, `...PNAMES`, `...EMPTY_COVERAGE`).
*0–5*.

D2. **Réparation `propertyNames`** — *5 %*
*Mesure* : renommage déterministe sur enum fermé, respect must‑cover sous AP\:false, re‑validation immédiate.
*0–5*.

D3. **`uniqueItems` + sac** — *3 %*
*Mesure* : de‑dup par hash structurel + re‑satisfaction déterministe.
*0–5*.

D4. **Garde de stagnation/budget** — *2 %*
*Mesure* : `UNSAT_BUDGET_EXHAUSTED` au bon moment, sans boucles.
*0–5*.

### E. Interop/drafts & réécritures — **10 %**

E1. **Normalisation de draft (tuples, OAS `nullable`, exclusives)** — *4 %*
*Mesure* : golden tests de conversion + notes attendues.
*0–5*.

E2. **Réécriture `propertyNames`** — *3 %*
*Mesure* : respect strict des préconditions, émission `PNAMES_REWRITE_APPLIED`, non‑réécriture sinon avec `PNAMES_COMPLEX`.
*0–5*.

E3. **`$dynamic*` et refs externes** — *3 %*
*Mesure* : pass‑through + note `DYNAMIC_PRESENT`, refs externes jamais déréférencées.
*0–5*.

### F. Déterminisme & cache — **10 %**

F1. **RNG & tie‑break** — *4 %*
*Mesure* : reproduction bit‑à‑bit des tie‑breaks (`tiebreakRand` consigné) sur N répétitions.
*0–5*.

F2. **Clés de cache/mémo** — *3 %*
*Mesure* : présence des composantes normatives (AJV.major, flags, PlanOptionsSubKey, canonPath).
*0–5*.

F3. **Indépendance horloge/locale** — *3 %*
*Mesure* : invariance des résultats en changeant TZ/LANG.
*0–5*.

---

## 4) Règles de notation par critère (0–5)

* **5** : conforme sur 100 % des cas ciblés (ou objectifs SLO atteints).
* **4** : conforme ≥ 95 % (écarts mineurs/connus, diagnostics présents).
* **3** : conforme ≥ 90 % (quelques écarts non bloquants).
* **2** : conforme ≥ 75 % (lacunes notables ou diagnostics manquants).
* **1** : conforme ≥ 60 % (instable).
* **0** : < 60 % ou comportement hors spec.

> Pour les objectifs chiffrés (latence, mémoire), utiliser les seuils donnés dans chaque critère.

---

## 5) Facteurs de pénalité (optionnels, max −10 points)

* **Ambiguïtés de spec non résolues** impactant la testabilité (p.ex. bornage de témoins de pattern non paramétré) : −3.
* **Diagnostic `details` non normalisé** sur ≥ 3 codes majeurs : −3.
* **Absence d’API must‑cover au Repair** (si implémentation requise) : −4.

---

## 6) Feuille de calcul (gabarit)

```
Garde-fous : [OK/KO]  → KO ⇒ Non viable

A1 ... F3 (0–5)  → pondération → sous-score
Somme pondérée → /100
Pénalités éventuelles → –X
Note finale → /100  → Qualification
```

---

## 7) Données minimales à collecter

* Taux de succès par suite (unit/intégration/fuzz/métamorphiques).
* Échantillons de diagnostics (par code), avec `details` et `canonPath`.
* Séries de répétitions (N≥5) pour la stabilité RNG et l’indépendance TZ/LANG.
* Bench par profil (p50/p95 latence, mémoire, validations/row, repairPasses/row).
* Preuves d’absence d’I/O sur `$ref` externes.

---

SPECIFICATION A NOTER :



