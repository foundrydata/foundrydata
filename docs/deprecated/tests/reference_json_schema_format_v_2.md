# Format

> **Statut : non‑normatif.** Cette page explique la spécification.
> L’enforcement (assertif vs annotatif) est défini par **Policy : Format Handling by Draft (v2.2)**.
> Le Guide d’implémentation ne doit pas dévier de cette policy.

<!-- doctrine: non-normative; policy-ref: Policy: Format Handling by Draft (v2.2) -->

Le mot‑clé `format` apporte une **information sémantique** pour des valeurs difficiles à décrire uniquement par des contraintes structurelles. La spécification JSON Schema définit plusieurs formats « intégrés » et permet aussi aux auteurs de schémas d’en déclarer **sur mesure**.

Comme JSON n’a pas de type « date/heure », on encode les dates sous forme de chaînes ; `format` permet d’indiquer que la chaîne doit être interprétée comme une date.

- **Par défaut, `format` est une annotation** et **n’influe pas** sur la validation.
- Un validateur peut offrir un **mode assertion** (ou un vocabulaire dédié en 2020‑12) qui fait échouer la validation si la valeur ne respecte pas le format déclaré.
- Les validateurs peuvent ne prendre en charge qu’un **sous‑ensemble** des formats intégrés, ou n’en faire qu’une **validation partielle** (ex. vérification « laxiste » des e‑mails).
- Les **formats inconnus doivent être ignorés** (ils restent des annotations).

> **Note (2020‑12).** Le split entre les vocabulaires `format-annotation` et `format-assertion` formalise ce choix : on **annote** toujours, et on **asserte** uniquement si le vocabulaire/option est activé.

---

## Formats intégrés

Le mot‑clé `format` n’est pas limité aux chaînes ; des extensions peuvent viser d’autres types. Ci‑dessous, les formats définis par la spec (regroupés pour clarté).

### Dates et heures (RFC 3339)
- **`date-time`** : ex. `2018-11-13T20:20:39+00:00`
- **`date`** *(introduit en draft‑07)* : ex. `2018-11-13`
- **`time`** *(introduit en draft‑07)* : ex. `20:20:39+00:00`
- **`duration`** *(introduit en 2019‑09)* : durée ISO 8601, ex. `P3D` (3 jours)

### Adresses e‑mail
- **`email`** : adresse de courrier (RFC 5322)
- **`idn-email`** : adresse internationalisée (RFC 6531)

### Noms d’hôte
- **`hostname`** : nom d’hôte (RFC 1034/1123)
- **`idn-hostname`** : nom d’hôte internationalisé (RFC 5890)

### Adresses IP
- **`ipv4`** : notation « dotted‑quad » (réf. RFC 2673 §3.2)
- **`ipv6`** : adresse IPv6 (RFC 4291)

### Identifiants de ressource
- **`uri`** : URI (RFC 3986)
- **`uri-reference`** : URI ou référence relative (RFC 3986 §4.1)
- **`iri`** : IRI (RFC 3987)
- **`iri-reference`** : IRI ou référence relative (RFC 3987)
- **`uuid`** *(introduit en 2019‑09)* : identifiant UUID (RFC 4122)

### Modèles d’URI
- **`uri-template`** : RFC 6570 (tout niveau)

### JSON Pointer
- **`json-pointer`** : RFC 6901 (forme chaîne, ex. `/foo/bar`)
- **`relative-json-pointer`** : pointeur JSON relatif

### Expressions régulières
- **`regex`** : dialecte **ECMA‑262**. Les validateurs doivent au minimum accepter le **sous‑ensemble sûr** défini par la spec ; beaucoup acceptent la grammaire complète ECMA‑262.

---

## Comportement et interopérabilité

- **Sémantique par défaut.** Traiter `format` comme **annotation** tant que le validateur n’est pas explicitement configuré (ou que le dialecte ne déclare pas `format-assertion`) pour l’appliquer **en assertion**.
- **Support partiel.** Les écarts de stricteté sont autorisés par la spec (ex. e‑mail strict vs laxiste). Documenter toute règle produit locale.
- **Formats inconnus.** Les noms non reconnus **doivent être ignorés** (annotation uniquement).

---

## Politique projet (rappel)

Dans FoundryData (tests & générateurs), le caractère **assertif** ou **annotatif** d’un format est défini par **Policy : Format Handling by Draft (v2.2)**. Le Guide ne doit **pas** surcharger cette règle. Se référer au tableau de la policy pour le comportement par draft.

