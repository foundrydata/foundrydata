# AGENT Runbook — Operating Mode (GPT-5 Codex)

**Purpose.** Discipline d’exécution et garde-fous pour implémenter **FoundryData** depuis la **SPEC**.
**Audience.** Agent GPT-5 Codex (VS Code) opérant sur les tâches 1..24.
**Status.** Actif — à appliquer systématiquement.

---

## TL;DR opératoire

1. **Source de vérité** : SPEC > AGENTS.md > notes Tasks.
2. **Refactor complet** : **ne pas** utiliser le legacy comme référence (sauf exception formalisée).
3. **REFONLY** : référencer la SPEC par **anchors** uniquement (pas de copie de prose).
4. **Boucle** : `get_task` → `set_status(in-progress)` → anchors (max 5) → **PLAN.md** → **PATCH+TESTS** (≥80% sur fichiers touchés) → **build/test/bench** → **diag-schema** → **commit** (template) → `set_status(done)`.
5. **Diagnostics** : phase correcte, champs obligatoires (`tiebreakRand`, `exclusivityRand`, `budget`).
6. **AP:false** : pas d’expansion via `propertyNames.enum` sans `PNAMES_REWRITE_APPLIED`; fail-fast uniquement sous **presence pressure**.
7. **AJV** : deux instances, flags **identiques** (cf. SPEC §§12–13).
8. **Quotas contexte** : ≤5 anchors/itération, ≤2 sections SPEC complètes (via Grep bornes + Read calculé).
9. **Bench gates** : `p95 ≤ 120ms`, `mem ≤ 512MB`.
10. **Escalade** : SPEC ambiguë/contradictoire → bloquer, produire `SPEC-QUESTION.md`.

---

## Contexte projet — Refactor complet

* Branche `feature-simplification` = **réécriture from scratch** suivant la SPEC.
* **Interdits** sans exception documentée :

  * Référencer/porter le legacy pour comportements/architecture.
  * Conserver dettes/contournements du legacy.

---

## Règles d’or

1. **SPEC seule fait foi.** Pas d’élargissement de périmètre.
2. **REFONLY par anchors.** Pas de prose SPEC recopiée.
3. **Séparation des phases** (Normalize → Compose → Generate → Repair → Validate).
4. **Déterminisme** : RNG seedé, pas d’état global, journaux de décision.
5. **Vérifiabilité** : diagnostics conformes §19.1, schémas de sortie ci-dessous.

---

## Boucle d'exécution (Run Loop)

```
Step 0  Sanity: tâches disponibles ?
        → mcp__task-master-ai__next_task() ou Playbook "No Task".

Step 1  Obtenir la tâche et marquer comme en cours :
        → mcp__task-master-ai__get_task(id)
        → mcp__task-master-ai__set_task_status(id, "in-progress")

Step 2  REFONLY: identifier sections requises (≤2 sections/itération). Grep bornes + Read calculé pour chaque section.

Step 3  Produire PLAN.md (200–400 mots) + liste fichiers touchés (contrat ci-dessous).

Step 4  Générer PATCH + TESTS (cov ≥80% sur fichiers touchés).

Step 5  Exécuter build/test/bench (cmd exactes plus bas).

Step 6  Valider diagnostics (schéma "diagnosticsEnvelope.schema.json").

Step 7  Commit (template), trailer REFONLY valide.

Step 8  Marquer la tâche comme terminée :
        → mcp__task-master-ai__set_task_status(id, "done")
```

**Commandes standard (npm workspaces du repo)**

```bash
npm i
npm run build
npm run test
npm run typecheck
npm run lint
```

> Si pnpm est activé : utiliser les variantes `pnpm -w ...`.

### Exécution de Code TypeScript — Protocole `tsx`

**CRITICAL**: Ne **jamais** utiliser `bash -lc 'node - <<EOF'` pour du code TypeScript. Node.js ne peut pas importer des fichiers `.ts` non compilés.

**❌ INCORRECT (échoue avec ERR_MODULE_NOT_FOUND)**

```bash
bash -lc 'node - <<EOF
import { executePipeline } from './packages/core/src/pipeline/orchestrator.js';
const res = await executePipeline(schema, options);
console.log(res);
EOF
'
```

**✅ CORRECT : Utiliser `npx tsx --eval` avec wrapper async**

```bash
npx tsx --eval "(async () => {
  const { executePipeline } = await import('./packages/core/src/pipeline/orchestrator.js');
  const { dependentAllOfCoverageSchema } = await import('./packages/core/src/pipeline/__fixtures__/integration-schemas.js');

  const res = await executePipeline(dependentAllOfCoverageSchema, {
    mode: 'strict',
    generate: { count: 2, seed: 37 },
    validate: { validateFormats: false },
  });
  console.log('generated', res.artifacts.generated?.items);
  console.log('repair', res.artifacts.repaired);
  console.log('actions', res.artifacts.repairActions);
})()"
```

**Pourquoi `tsx` ?**

* Gère automatiquement les imports TypeScript `.ts` → `.js`
* Pas besoin de compilation préalable
* Support ESM natif avec `import`
* Déterministe et reproductible

**Alternatives (si compilation déjà faite)**

```bash
# 1. Compiler d'abord
npm run build

# 2. Utiliser les fichiers compilés dans dist/
node -e "
import { executePipeline } from './packages/core/dist/pipeline/orchestrator.js';
// ...
"
```

**Note pour Codex AI** : Codex tente parfois `bash -lc 'node - <<EOF'` pour des tests rapides. Toujours intercepter et remplacer par `npx tsx -e "..."` pour éviter ERR_MODULE_NOT_FOUND.

---

## Contrats de sortie (schémas et formats)

> Les objets ci-dessous **doivent** être produits et validés localement.

### 1) `refonlyRecord.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["anchors", "summary"],
  "properties": {
    "anchors": {
      "type": "array",
      "minItems": 1,
      "items": { "type": "string", "pattern": "^spec://§[0-9]+#[a-z0-9\\-]+$" },
      "maxItems": 12
    },
    "summary": { "type": "string", "minLength": 1, "maxLength": 240 }
  },
  "additionalProperties": false
}
```

**Encapsulation REFONLY (dans tasks 9100..9124 et trailer de commit)**
Chaîne stockée :

```
REFONLY::{"anchors":[...],"summary":"..."}
```

Règles : (a) le JSON externe (si présent) doit parser ; (b) **après** suppression du préfixe `REFONLY::`, le JSON interne **doit** parser et satisfaire le schéma.

---

### 2) `plan.schema.json` (PLAN.md rendu en JSON à la validation)

```json
{
  "$schema": "http://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["taskId", "title", "anchors", "touchedFiles", "approach", "checks"],
  "properties": {
    "taskId": { "type": "string", "pattern": "^[0-9]{1,5}$" },
    "title": { "type": "string", "minLength": 3 },
    "anchors": {
      "type": "array",
      "minItems": 1,
      "maxItems": 5,
      "items": { "type": "string", "pattern": "^spec://§[0-9]+#[a-z0-9\\-]+$" }
    },
    "touchedFiles": {
      "type": "array",
      "items": { "type": "string", "minLength": 1 },
      "minItems": 1
    },
    "approach": { "type": "string", "minLength": 50, "maxLength": 1200 },
    "risks": { "type": "string" },
    "checks": {
      "type": "object",
      "required": ["build", "test", "bench", "diagSchema"],
      "properties": {
        "build": { "const": "npm run build" },
        "test": { "const": "npm run test" },
        "bench": { "const": "npm run bench" },
        "diagSchema": { "type": "boolean", "const": true }
      }
    }
  },
  "additionalProperties": false
}
```

---

### 3) `diagnosticsEnvelope.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["code", "phase", "details"],
  "properties": {
    "code": { "type": "string", "minLength": 1 },
    "phase": { "type": "string", "enum": ["Normalize", "Compose", "Generate", "Repair", "Validate"] },
    "details": { "type": "object" },
    "budget": {
      "type": "object",
      "properties": {
        "skipped": { "type": "boolean" },
        "tried": { "type": "integer", "minimum": 0 },
        "limit": { "type": "integer", "minimum": 0 },
        "reason": { "type": "string", "enum": ["skipTrialsFlag", "largeOneOf", "largeAnyOf", "complexityCap"] }
      },
      "additionalProperties": false
    },
    "scoreDetails": {
      "type": "object",
      "properties": {
        "tiebreakRand": { "type": "number" },
        "exclusivityRand": { "type": "number" }
      },
      "additionalProperties": true
    }
  },
  "additionalProperties": true
}
```

**Table de vérité “code ↔ phase” (extrait)**

| Code                    | Phase autorisée     |
| ----------------------- | ------------------- |
| REGEX_COMPLEXITY_CAPPED | Normalize / Compose |
| COMPLEXITY_CAP_PATTERNS | Generate            |
| COMPLEXITY_CAP_ONEOF    | Compose             |
| COMPLEXITY_CAP_ANYOF    | Compose             |
| COMPLEXITY_CAP_ENUM     | Compose             |
| COMPLEXITY_CAP_CONTAINS | Compose             |
| SCHEMA_SIZE             | Compose             |

---

### 4) `benchGate.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["p95LatencyMs", "memoryPeakMB"],
  "properties": {
    "p95LatencyMs": { "type": "number", "maximum": 120 },
    "memoryPeakMB": { "type": "number", "maximum": 512 }
  },
  "additionalProperties": false
}
```

---

## Politique REFONLY — Anchors uniquement

**Mapping d'anchor**

```
spec://§<n>#<slug> → docs/feature-simplification/feature-support-simplification.md#s<n>-<slug>
```

**Procédure de lecture SPEC (feature-support-simplification.md = 2676 lignes)**

Le fichier SPEC est trop volumineux pour lecture sans précision. **Toujours** utiliser ce protocole :

### Protocole Obligatoire : Grep Bornes + Read Calculé

**Étape 1 : Grep Section Bounds (parallèle)**

```bash
# Pour lire §N, grep début et fin
Grep({ pattern: '^<a id="s7-', '-n': true, head_limit: 1 })  # → ligne 321
Grep({ pattern: '^<a id="s8-', '-n': true, head_limit: 1 })  # → ligne 650
```

**Étape 2 : Calcul Automatique**

```typescript
const start = 321;   // Premier anchor §7
const end = 650;     // Premier anchor §8 (borne supérieure)
const limit = end - start;  // = 329 lignes pour §7 complet
```

**Étape 3 : Read Exact**

```bash
Read({
  file_path: 'docs/feature-simplification/feature-support-simplification.md',
  offset: start,
  limit: limit
})
# Lit EXACTEMENT §7, 100% efficacité, 0% gaspillage
```

### Justification Technique

**Fichier = 2676 lignes**, sections typiques = 200-500 lignes :

| Méthode | Tokens Chargés | Efficacité | Problème |
|---------|----------------|------------|----------|
| `Read(offset)` sans limit | ~2000 lignes | ❌ 15-20% | Charge §7+§8+§9+§10... = 82% waste |
| `Read(offset, limit: 100)` | ~100 lignes | ❌ 30% | Tronque §7 à 30%, manque 70% du contenu |
| **Grep bornes + Read** | ~329 lignes | ✅ 100% | Exactement §7, rien d'autre |

### Pattern Universel (pour toute section §N)

```typescript
// Fonction générique
function readSpecSection(n: number) {
  // 1. Grep bornes (parallèle = 1 message, 2 tool calls)
  const startLine = grep(`^<a id="s${n}-`, extract_first_line);
  const endLine = grep(`^<a id="s${n+1}-`, extract_first_line) || 2676; // EOF si dernière section

  // 2. Read calculé
  return Read({
    offset: startLine,
    limit: endLine - startLine
  });
}

// Usage
readSpecSection(7);   // Lit exactement §7 (lignes 321-650)
readSpecSection(19);  // Lit exactement §19 jusqu'à EOF
```

### Quotas REFONLY (inchangés)

* Max **5 anchors** par itération
* Max **2 sections complètes** par itération (si sections longues >300 lignes)
* Si >5 anchors requis → produire **Context Expansion Request**

**Context Expansion Request**

```json
{
  "type": "context-expansion",
  "reason": "anchors>5 ou sections>2",
  "proposedAnchors": ["spec://§8#branch-selection-algorithm", "..."]
}
```

### Exemples Concrets

**✅ CORRECT : §7 Normalizer**

```bash
# Grep bornes
Grep({ pattern: '^<a id="s7-', '-n': true })  # → 321
Grep({ pattern: '^<a id="s8-', '-n': true })  # → 650

# Read exact
Read({ offset: 321, limit: 329 })
# Résultat : 329 lignes, 100% §7
```

**❌ INCORRECT : Read sans calcul**

```bash
# Mauvais
Read({ offset: 321 })  # Lit 2000 lignes = §7+§8+§9+§10... (82% waste)

# Mauvais
Read({ offset: 321, limit: 100 })  # Tronque §7 à ligne 420, manque 250 lignes (70% manquant)
```

### Alternative : Grep -A (sections courtes <200 lignes uniquement)

```bash
# Pour petites sections seulement
Grep({ pattern: '<a id="s13-formats"></a>', '-A': 180, '-n': true })
# Trade-off: 1 tool call, mais risque si estimation fausse
```

**Règle** : Préférer toujours **Grep bornes + Read calculé** (robuste, précis, 100% efficient).

---

## Quotas & limites

* Anchors par itération : **≤5**
* Sections SPEC complètes par itération : **≤2** (si sections >300 lignes)
* Longueur PLAN.md : **200–600 mots**
* Trailer REFONLY `summary` : **≤240 caractères**

**Note** : "Fenêtre par anchor" n'est plus applicable car on lit des **sections complètes** via Grep bornes + Read calculé. Une section §N contient plusieurs anchors et doit être lue intégralement.

---

## Diagnostics — Garde-fous additionnels

* **Score-only** : `scoreDetails.tiebreakRand` **toujours** enregistré, même si `|T|=1`.
* **oneOf exclusivity / step-4** : si RNG utilisée, enregistrer `scoreDetails.exclusivityRand`.
* **Budget score-only** : renseigner `{skipped,tried,limit,reason}` avec `K_effective = min(maxBranchesToTry, branches.length)` **après** caps de Compose.

---

## AP:false — Rappels opératoires + cas

* **Jamais** d’expansion de couverture depuis `propertyNames.enum` **sans** `PNAMES_REWRITE_APPLIED`.
* **Fail-fast `AP_FALSE_UNSAFE_PATTERN`** uniquement sous **presence pressure** (`effectiveMinProperties > 0` **ou** `effectiveRequiredKeys ≠ ∅` **ou** `dependentRequired` effectif).
* **`propertyNames.pattern` brut** ne déclenche **pas** `AP_FALSE_UNSAFE_PATTERN` (gating-only), sauf si réécrit explicitement (P2).

**Cas minimal positif**

```json
{
  "additionalProperties": false,
  "properties": { "a": { "type": "string" } },
  "propertyNames": { "enum": ["a","b"] },
  "PNAMES_REWRITE_APPLIED": true
}
```

→ Couverture = `{a,b}` (ancrée-safe) ; OK.

**Cas négatif (pas de rewrite)**

```json
{
  "additionalProperties": false,
  "propertyNames": { "enum": ["x"] }
}
```

→ Couverture **n’augmente pas** ; `x` reste gating-only.

---

## AJV — Parité d’instances (résumé opératoire)

Deux instances : **Source** (schéma original) et **Planning/Generation** (vue canonique).
Contraintes minimales (alignées SPEC §§12–13) :

* `unicodeRegExp:true` **sur les deux**.
* Dialecte compatible (draft-04/07/2019-09/2020-12) sans mélange dans la même instance.
* `validateFormats`: **identique** sur les deux (false/false ou true/true avec `ajv-formats`).
* `multipleOfPrecision` = `PlanOptions.rational.decimalPrecision` **sur les deux** quand `rational.fallback ∈ {"decimal","float"}`.
* `discriminator` : si activé, **sur les deux**.

Écart ⇒ `AJV_FLAGS_MISMATCH`.

---

## Playbooks

### A) **No Task Available**

1. **Diagnostics conformance audit** (tâche 16) sur code existant → produire liste des diagnostics hors phase.
2. **Bench harness durcissement** (tâche 15) → rapport `benchGate.json` conforme au schéma.
3. **Couverture tests** (tâche 17) → rapport des fichiers <80% (sur fichiers déjà touchés).
4. **Docs** (tâche 19) → compléter matrices et sections manquantes.

### B) **SPEC ambiguë/contradictoire**

* Geler la tâche. Créer `SPEC-QUESTION.md` :

```md
# SPEC Question
Anchor(s): [spec://§...]
Symptôme: ...
Impact: ...
Proposition: ...
```

### C) **Exception Legacy (rare)**

* Créer issue `legacy-exception:<slug>`.
* Décrire **motif**, preuves SPEC, **scope minimal**, **tests de verrouillage**.
* Autorisation requise avant tout port ciblé ; supprimer dès remplacement SPEC-compliant.

---

## Templates prêts à l’emploi

### Commit message

```
feat(core): task <ID> — <titre court>

- <3–4 points factuels de changement>
- tests: <pkg>/<file>.spec.ts (cov >=80% touched)

REFONLY::{"anchors":["spec://§8#branch-selection-algorithm"],"summary":"<résumé 1 ligne>"}
```

### PLAN.md (200–400 mots)

```
Task: <id>   Title: <title>
Anchors: [spec://§<n>#<slug>, ...]  (≤5)
Touched files:
- packages/<pkg>/src/...
- packages/<pkg>/test/...

Approach:
<description concise de l’implémentation alignée SPEC, décisions clés, invariants, points d’intégration>

Risks/Unknowns:
<liste brève>

Checks:
- build: npm run build
- test: npm run test
- diag-schema: true
```

### Exemple d’enveloppe diagnostics

```json
{
  "code": "COMPLEXITY_CAP_ONEOF",
  "phase": "Compose",
  "details": { "limit": 32, "reason": "largeOneOf" },
  "budget": { "skipped": true, "tried": 0, "limit": 32, "reason": "largeOneOf" },
  "scoreDetails": { "tiebreakRand": 0.4123 }
}
```

---

## Déterminisme (côté agent)

* Aucune sélection stochastique d’anchors ; lister dans l’ordre demandé par la SPEC/tâche.
* Enregistrer les décisions dans `agent-log.jsonl` (JSON lines : opération, horodatage, taskId, anchors, fichiers modifiés, seeds RNG lors de `oneOf` step-4).
* Pas de mutation de global state ; pas de réécriture d’IDs arbitraire.

---

## Intégration Task Master — Slash Commands & CLI

**Politique d'accès** : **ne jamais** lire `.taskmaster/*.json` directement ; **toujours** utiliser les slash commands ou la CLI.

**Tag actif** : `feature-simplification` — Toutes les tâches 1..24 sont gérées sous ce tag (vérifié via `npx task-master list`).

### Slash Commands Disponibles (Recommandé)

Les 44 slash commands Task Master sont disponibles avec la syntaxe `/tm:category:command` :

```bash
# Commandes principales
/tm:list:list-tasks                          # Lister les tâches
/tm:show:show-task <id>                      # Voir une tâche
/tm:next:next-task                           # Prochaine tâche recommandée
/tm:set-status:to-in-progress <id>           # Marquer en cours
/tm:set-status:to-done <id>                  # Marquer done
/complete-task <id>                          # Compléter avec validation

# Analyse & expansion
/tm:analyze-complexity:analyze-complexity    # Analyse de complexité
/tm:expand:expand-task <id>                  # Décomposer une tâche
/tm:complexity-report:complexity-report      # Voir le rapport

# Dépendances
/tm:validate-dependencies:validate-dependencies  # Valider les dépendances
/tm:add-dependency:add-dependency            # Ajouter une dépendance
/tm:remove-dependency:remove-dependency      # Retirer une dépendance
```

**Référence complète** : [.claude/TASK_MASTER_QUICK_REF.md](./.claude/TASK_MASTER_QUICK_REF.md)

### CLI Task Master (Alternative)

Toutes les commandes sont également disponibles via CLI :

```bash
# Lister les tâches
npx task-master list

# Voir une tâche
npx task-master show <id>

# Prochaine tâche
npx task-master next

# Changer le statut
npx task-master set-status --id=<id> --status=done
npx task-master set-status --id=<id> --status=in-progress

# Valider les dépendances
npx task-master validate-dependencies
```

### Workflow Typique

```bash
# 1. Trouver la prochaine tâche
/tm:next:next-task
# ou: npx task-master next

# 2. Marquer comme en cours
/tm:set-status:to-in-progress <id>
# ou: npx task-master set-status --id=<id> --status=in-progress

# 3. [Implémenter la tâche...]

# 4. Marquer comme terminée avec validation complète
/complete-task <id>
# ou: npx task-master set-status --id=<id> --status=done
```

### ⚠️ Outils MCP Non Disponibles

Les 36 outils MCP Task Master (`mcp__task-master-ai__*`) sont **rejetés par VSCode** en raison d'une incompatibilité avec JSON Schema Draft 2020-12 `$dynamicRef`.

**Workaround** : Utiliser les slash commands ou la CLI directe (voir ci-dessus).

---

## Définition de Fini (DoD)

* Fichiers livrés par sous-tâches.
* Tests verts, **cov ≥80%** sur fichiers touchés.
* Diagnostics conformes **§19.1**.
* Validation finale AJV sur **schéma original**.
* REFONLY correct (schéma + trailer).
* Bench gates respectés (profils requis).
* Pas de texte SPEC copié.

---

## Erreurs courantes à éviter (résumé)

* Émettre `REGEX_COMPLEXITY_CAPPED` hors Normalize/Compose.
* Émettre `COMPLEXITY_CAP_PATTERNS` hors Generate.
* Oublier `tiebreakRand` quand `|T|=1`.
* Étendre la couverture AP:false via `propertyNames.enum` sans flag.
* Diverger les flags AJV entre instances.
* Lire/parsing direct des fichiers Task Master.

---

## Maintenance

* **When in doubt, SPEC d’abord.**
* En cas de conflit SPEC vs AGENTS.md, **SPEC gagne**.
* Mettre à jour ce runbook **sans** altérer ses contrats (schémas/quotas/templates) sans justification explicite.

**Last Updated**: 2025-10-13
**Version**: 1.1.0 (GPT-5 Codex profile)
