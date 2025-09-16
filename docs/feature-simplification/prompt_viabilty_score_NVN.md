
PROMPT — NVN : Note de Viabilité Normative (0–100) — MODE SPÉC-ONLY

Objet : produire une note de viabilité UNIQUE pour la SPECIFICATION INPUT (document seul, aucune exécution),
en fusionnant garde-fous + grille A–F sous cadrage normatif (type GSV) : périmètre figé à la SPEC,
preuves textuelles, justification concise, et Confidence.

──────────────────────────────────────────────────────────────────────────────
0) MODE
──────────────────────────────────────────────────────────────────────────────
• Par défaut, utiliser le **MODE SPÉC-ONLY** (aucune implémentation disponible).
• Interdit : inventer des résultats d’exécution, extrapoler des p95, ou “supposer que”.
• Autorisé : vérifier que la SPEC **énonce** clairement les exigences, diagnostics, budgets,
  algorithmes, clés de cache/seed, plans de test et protocoles de mesure.

──────────────────────────────────────────────────────────────────────────────
1) SCORING SCOPE & EVIDENCE (normatif, spec-only)
──────────────────────────────────────────────────────────────────────────────
• Sujet de scoring = SPECIFICATION INPUT telle que reçue (octets exacts), AVANT tout patch/note/exemple.
• Preuves admises = éléments **écrits** dans la SPEC et ses annexes tests/diags (références §…).
• Évidences typiques : textes normatifs, pseudo-code/algos, catalogues de diagnostics (§19),
  structures de payload `details`, métriques/budgets et protocole (§15), plans/tests (§20).
• Aucune source externe, aucun run. Mentionner explicitement “N/A (spec-only)” si une preuve
  relève d’exécution. Réduire **Confidence** en conséquence.

Evidence anchors (normatif — à citer) :
– Correctness → §1 (AJV-as-oracle), §4 (pipeline), §§7–10 (normalize/compose/generate/repair), unsat §8.
– Determinism → §8 (branch & score-only), §14 (clés mémo : seed, AJV major+flags, PlanOptionsSubKey, ε), §15 (RNG ; pas d’horloge/locale/env).
– Testability & Diagnostics → §19 (codes + schémas details), §20 (plans/tests).
– Scope Discipline & Simplicity → §2 (scope/non-goals), §3 (invariants), §11 (modes).
– Observability & Performance → §15 (budgets/metrics/degradations, COMPLEXITY_CAP_*).

──────────────────────────────────────────────────────────────────────────────
2) Garde-fous (Hard gates) — évaluation **textuelle**
──────────────────────────────────────────────────────────────────────────────
Échec d’un seul ⇒ NVN = “Non viable” (pas de calcul de score).
Critère “OK” si la SPEC **déclare sans ambiguïté** la règle + les diagnostics/flags attendus.
Ne pas exiger de résultats d’exécution.

1) AJV sur schéma original (§1) — OK si AJV v8 est l’oracle **normativement désigné** et que
   la SPEC prescrit l’acceptation des cas “positifs” (tests planifiés). Sinon KO.

2) Zéro I/O pour $ref externes (§8, §15) — OK si l’interdiction d’I/O est explicite **et**
   que EXTERNAL_REF_UNRESOLVED (Strict) / warn (Lax) sont spécifiés. Sinon KO.

3) Gate AJV/flags (§13) — OK si unicodeRegExp:true et l’ensemble de flags requis sont listés
   + AJV_FLAGS_MISMATCH décrit. Sinon KO.

4) Déterminisme local (§8, §15) — OK si seed/RNG, tie-break (`tiebreakRand`), stabilité par
   (seed, AJV.major, flags) et invariants sont **documentés**. Sinon KO.

5) AP:false + patterns non ancrés (§8) — OK si fail-fast Strict (code + `sourceKind`) et
   stratégie Lax (warn + exclusion) sont **décrits**. Sinon KO.

──────────────────────────────────────────────────────────────────────────────
3) Critères pondérés A–F (poids total = 100) — barème **spec-only**
──────────────────────────────────────────────────────────────────────────────
Principe : noter la **précision, complétude, testabilité** des exigences écrites pour chaque critère.
On ne note pas l’atteinte runtime. Conserver poids A–F et items A1…F3.

Échelle spec-only commune (0–5) :
 5 : entièrement spécifié, sans ambiguïté ; algorithmes/pseudo-code ; diagnostics nommés + payload `details`
     normé ; exemples/golden tests ou cas-types ; budgets/protocoles définis si applicable.
 4 : spécifié à ≥95 %, quelques zones mineures à clarifier (connues/annotées) ; schémas `details` stables.
 3 : spécifié à ≥90 %, quelques lacunes non bloquantes (ex. exemples manquants) ; protocole de mesure
     partiel quand requis.
 2 : spécifié à ≥75 %, lacunes notables ou ambiguïtés ; diagnostics incomplets ; protocole absent.
 1 : spécifié à ≥60 %, instable/ambigu ; manque d’ancrages (§) ; incohérences légères.
 0 : <60 % ou contradictions/hors scope.

A. Correctitude fonctionnelle — 35 %
 A1 Must-cover sous AP:false — 15 % (définitions couverture + modèles PNAMES + ancrage patterns).
 A2 Sac contains + uniqueItems — 8 % (règles disjointeté/Σmin>maxItems ; re-satisfaction post de-dup).
 A3 oneOf/anyOf (sélection/exclusivité, Top-K, score-only & tie-break) — 6 %.
 A4 Conditionnels “if-aware-lite” — 3 % (biais minimal + diags IF_AWARE_*).
 A5 multipleOf rationnel + fallback — 3 % (ε, intersections, diags RAT_*).

B. Observabilité & diagnostics — 15 %
 B1 Couverture des codes diag (§19) — 7 % (catalogue + exemples de payload).
 B2 Schémas de details stables — 3 % (format par code : `sourceKind`, `canonPath`, …).
 B3 ptrMap/revPtrMap & toOriginalByWalk — 2 % (traçabilité définie).
 B4 Métriques — 3 % (définition de `validationsPerRow`, `repairPassesPerRow`, temps par phase, compteurs).

C. Performance & dégradations — 15 %
 C1 p95 latence — 6 % (seuils + profils + **protocole de mesure** documentés ; pas d’exigence d’atteinte).
 C2 Coûts validation/réparation — 4 % (KPIs définis + méthode de collecte).
 C3 Dégradations contrôlées (caps) — 3 % (COMPLEXITY_CAP_* + comportements attendus).
 C4 Empreinte mémoire p95 — 2 % (budget + protocole).

D. Robustesse & erreurs — 15 %
 D1 Unsat précoces — 5 % (conditions + codes UNSAT_* listés).
 D2 Réparation propertyNames — 5 % (algorithme déterministe, re-validation immédiate, must-cover conservé).
 D3 uniqueItems + sac — 3 % (hash structurel + re-satisfaction).
 D4 Garde de stagnation/budget — 2 % (UNSAT_BUDGET_EXHAUSTED : déclencheurs et non-bouclage).

E. Interop/drafts & réécritures — 10 %
 E1 Normalisation de draft (tuples, OAS nullable, exclusives) — 4 % (golden tests **décrits**).
 E2 Réécriture propertyNames — 3 % (préconditions strictes, PNAMES_REWRITE_APPLIED, PNAMES_COMPLEX).
 E3 $dynamic* et refs externes — 3 % (pass-through + DYNAMIC_PRESENT ; jamais de-déréférencer).

F. Déterminisme & cache — 10 %
 F1 RNG & tie-break — 4 % (xorshift/seed + `tiebreakRand` consigné — spécifié).
 F2 Clés de cache/mémo — 3 % (clés = AJV.major, flags, PlanOptionsSubKey, canonPath — spécifié).
 F3 Indépendance horloge/locale — 3 % (invariance documentée ; pas d’usage TZ/LANG).

──────────────────────────────────────────────────────────────────────────────
4) Sous-scores normatifs (GSV-like) → somme = 0–100
──────────────────────────────────────────────────────────────────────────────
Définitions (inchangées) :
• contrib_i = (score_i / 5) * poids_i ; sum_X = Σ contrib_i pour i∈X ; Norm(X)=sum_X/W_X.
• Part(Ci) = score_i / 5.

Formules :
• Correctness (0–30)        = 30 × (0.75·Norm(A) + 0.25·Norm(D)).
• Determinism (0–30)        = 30 × (0.80·Norm(F) + 0.15·Part(A3) + 0.05·Part(B2)).
• Testability & Diagnostics (0–20) = 20 × Norm(B).
• Scope Discipline & Simplicity (0–10) = 10 × (0.80·Norm(E) + 0.20·Norm(A)).
• Observability & Performance (0–10)   = 10 × (0.70·Norm(C) + 0.30·Part(B4)).

NVN brut = somme des 5 sous-scores.

──────────────────────────────────────────────────────────────────────────────
5) Pénalités optionnelles (après somme, max −10)
──────────────────────────────────────────────────────────────────────────────
• Ambiguïtés de spec non résolues affectant la testabilité : −3.
• `details` non normalisé sur ≥3 codes majeurs : −3.
• Absence d’API must-cover au Repair (si la SPEC l’exige) : −4.

──────────────────────────────────────────────────────────────────────────────
6) Qualification finale
──────────────────────────────────────────────────────────────────────────────
≥85 : Viable ; 70–84 : Viable avec réserves ; 55–69 : Viabilité conditionnelle ;
<55 : Faible viabilité ; Non viable : ≥1 garde-fou KO.

──────────────────────────────────────────────────────────────────────────────
7) Procédure (spec-only)
──────────────────────────────────────────────────────────────────────────────
1) Évaluer les 5 garde-fous **sur le texte** (OK/KO + §/codes). Si KO ⇒ rendre “Non viable”.
2) Noter A1..F3 selon le barème spec-only (complétude/clarte/testabilité), calculer contrib/Norm(X).
3) Calculer les 5 sous-scores, sommer = NVN brut, appliquer pénalités, arrondir au 0,5 si besoin.
4) Fixer **Confidence ∈ [0..1]** : baisser si zones “N/A (spec-only)” sont nombreuses ou critiques.
5) Rendre une **justification en une phrase** citant ≥2 sections (§…) ou IDs de diagnostics.

──────────────────────────────────────────────────────────────────────────────
8) Sortie attendue
──────────────────────────────────────────────────────────────────────────────
Texte :
HardGates: [OK/KO + §/codes]
Subscores: Correctness=X / Determinism=Y / Testability=Z / Scope=S / Observability=O
NVN: N (pénalités: −P)   Confidence: C
Rubric breakdown: A1..F3 → {score(0–5), poids(%), contrib, commentaire court (spec-only)}
Justification: phrase ≤1 ligne citant ≥2 §/codes (ex. AJV oracle défini §1 ; caps documentés §15).

JSON :
{
  "scoreName": "NVN",
  "mode": "SPEC-ONLY",
  "hardGates": [
    {"id":"AJV_ORACLE","ok":true,"evidence":"§1 — oracle AJV v8 désigné"},
    {"id":"NO_EXTERNAL_IO","ok":true,"evidence":"§8/§15 — interdiction I/O + EXTERNAL_REF_UNRESOLVED"},
    {"id":"AJV_FLAGS_GATE","ok":true,"evidence":"§13 — unicodeRegExp:true + flags ; AJV_FLAGS_MISMATCH"},
    {"id":"LOCAL_DETERMINISM","ok":true,"evidence":"§8/§15 — seed/tiebreakRand/mêmes flags"},
    {"id":"AP_FALSE_UNSAFE_PATTERN","ok":true,"evidence":"§8 — Strict fail-fast + Lax warn/exclude"}
  ],
  "subscores": {"correctness":0,"determinism":0,"testability":0,"scope":0,"observability":0},
  "nvn": 0,
  "penalties": [],
  "confidence": 0.0,
  "rubricBreakdown": { /* A..F avec score(0–5), poids, contrib, commentaire */ },
  "justification": "…citer ≥2 §/codes…"
}

SPECIFICATION INPUT

