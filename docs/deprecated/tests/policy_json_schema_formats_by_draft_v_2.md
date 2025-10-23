# Policy: Format Handling by Draft (Normative)

**Version:** 2.2 (adds explicit format policy)\
**Scope:** Applies to all testing and generation for JSON Schema drafts **draft‑07**, **2019‑09**, **2020‑12**. AJV remains the reference validator, but this section is the **single source of truth** for format semantics.

---

## 1) Principles (MUST / SHOULD)

- **MUST** classify each `format` as **Assertive** (validation-error on mismatch) or **Annotative** (no validation effect).
- **MUST** keep the classification **consistent across drafts**, unless the draft semantics force a difference.
- **MUST** document any **non-standard/vendor** formats (e.g., `semver`) explicitly.
- **SHOULD** prefer **assertion** for formats with clear, unambiguous definitions and stable libraries.
- **MUST** degrade unknown/unsupported formats to **Annotative** and **log** the downgrade at test start.
- **MUST** verify this policy in CI across the draft × platform matrix.

> Rationale: FoundryData targets 100% schema compliance with deterministic behavior. Explicit format semantics eliminate drift and false positives across drafts and validators.

---

## 2) Classification by Draft

> Legend: **A** = Assertive, **Ann** = Annotative.  Non‑standard formats are marked *(vendor)*.

### 2.1 Draft‑07

| Format                                                           | Policy                                         |
| ---------------------------------------------------------------- | ---------------------------------------------- |
| `date-time`, `date`, `time`, `email`, `hostname`, `ipv4`, `ipv6` | **A**                                          |
| `uri`, `uri-reference`, `iri`, `iri-reference`                   | **A**                                          |
| `regex`                                                          | **A**                                          |
| `uri-template`, `json-pointer`, `relative-json-pointer`          | **Ann** (edge parsing differences across libs) |
| `uuid` *(vendor)*                                                | **A** (documented deviation from core spec)    |
| Others / unknown                                                 | **Ann** + log downgrade                        |

### 2.2 Draft 2019‑09

| Format                                                         | Policy                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------- |
| `date-time`, `date`, `time`                                    | **A**                                                         |
| `email`, `hostname`, `idn-email`, `idn-hostname`               | **A** (when library support present); otherwise **Ann** + log |
| `ipv4`, `ipv6`, `uri`, `uri-reference`, `iri`, `iri-reference` | **A**                                                         |
| `regex`, `duration`                                            | **A**                                                         |
| `json-pointer`, `relative-json-pointer`, `uri-template`        | **Ann**                                                       |
| `uuid`                                                         | **A**                                                         |
| Others / unknown                                               | **Ann** + log                                                 |

### 2.3 Draft 2020‑12

| Format                                                         | Policy                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------- |
| `date-time`, `date`, `time`, `duration`                        | **A**                                                         |
| `email`, `hostname`, `idn-email`, `idn-hostname`               | **A** (when library support present); otherwise **Ann** + log |
| `ipv4`, `ipv6`, `uri`, `uri-reference`, `iri`, `iri-reference` | **A**                                                         |
| `regex`                                                        | **A**                                                         |
| `json-pointer`, `relative-json-pointer`, `uri-template`        | **Ann**                                                       |
| `uuid`                                                         | **A**                                                         |
| Others / unknown                                               | **Ann** + log                                                 |

---

## 3) Test & Governance Requirements

- **Conformance gates (MUST):**
  - A small, draft‑aware conformance suite that **fails** on any asserted format mismatch and **warns** (not fails) on annotative formats.
  - A CI check that **prints** the active classification table at job start.
- **Drift control (MUST):** Include a **doctrine version tag** (e.g., `Testing‑Doctrine: 2.2`) in both this Strategy doc and the Implementation Guide; CI fails if tags diverge.
- **Cross‑validator sanity (SHOULD):** Periodically compare AJV with a second validator for asserted formats to detect ecosystem regressions (non‑blocking).

---

## 4) Non‑Standard Formats (Vendor)

- `semver` and other vendor formats are **Assertive** only when explicitly listed here. `uuid` is vendor-only in **draft‑07** and **built-in** starting with **2019‑09**. Vendor formats not listed are **Annotative** by default.
- Any addition/removal **MUST** come with a one‑line rationale and a changelog entry.

---

## 5) Implementation Notes (Non‑normative)

- In draft **2020‑12**, enforcement uses the `format-assertion` vocabulary (or an equivalent validator option). CI **MUST** verify it's enabled when asserted behavior is required.
- This policy describes **behavioral intent**, not the mechanics. Concrete configuration and helper code live in the Implementation Guide.
- If a library changes semantics for a given format, treat it as a potential breaking change; update this table first, then the implementation.

---

## 6) How other docs reference this policy (MUST)

- The **Complete Testing Guide** must reference this section once at the top of its configuration chapter as the authority for `format` behavior (no duplication of the table).
- All examples and snippets in the Guide must say: “**as per the Formats Policy**”.