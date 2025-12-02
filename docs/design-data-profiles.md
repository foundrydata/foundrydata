# Architecture Brief — Data Profiles (Realism vs Minimality)

## 1. Purpose & Context

This document frames the architectural decisions around **data profiles** for
FoundryData: how realistic, strict, or minimal generated instances should be,
and how this interacts with the canonical SPEC and AJV configuration.

The SPEC (see `spec://§9#strings-and-formats`, `spec://§13#ajv-flags-parity`)
defines:

- a default, annotate‑only mode (`validateFormats:false`), and
- an optional “Strict Data Compliance” profile where `validateFormats:true`
  and format‑valid values must be synthesized for at least `email`, `uri`,
  `uuid`, and `date-time`.

Within this envelope, implementations are free to define **higher‑level
profiles** (e.g. “minimal”, “realistic”, “strict”) that bundle options and
behaviours. This brief sets the stage for such profiles without changing
SPEC‑level semantics.

---

## 2. Problem Statement

Today, FoundryData effectively operates in a single behavioural regime:

- `validateFormats:false` on both AJV instances;
- the Generator often produces **minimal values** (e.g. empty strings, empty
  objects) that satisfy type/required constraints but are not necessarily
  realistic domain values;
- the AJV‑driven Repair phase may synthesize/sanitize values further, within
  a bounded budget, but without a clearly communicated “profile” to users.

This is:

- SPEC‑compliant, but
- ambiguous for users: they do not know whether they can rely on the data
  being realistic (e.g. valid UUIDs, plausible emails), how much “magic”
  Repair is allowed to perform, or how to switch behaviour depending on
  their use case (unit tests vs QA vs production‑like staging).

We need a clearer, profile‑based story that stays within SPEC while giving
FoundryData a strong, opinionated UX.

---

## 3. Goals

The goals of introducing explicit data profiles are:

1. **Make data expectations explicit**  
   Users should know what they get in terms of realism and strictness when
   they choose a profile, including how much work is done by Generator vs
   Repair for a given profile.

2. **Stay strictly SPEC‑compliant**  
   Profiles must not violate requirements on AJV flags, format handling, or
   determinism. The optional Strict Data Compliance profile in the SPEC
   should map cleanly to one of our profiles.

3. **Separate semantics from style**  
   Profiles may change *how* we generate values (realistic vs minimal),
   and may bundle different AJV flag settings, but they must not silently
   change the underlying notion of “valid JSON Schema instance” for the
   same AJV configuration. Any change of validation semantics (e.g.
   `validateFormats:true` vs `false`) must be explicit in configuration.

4. **Integrate with testing and observability**  
   Profiles must be describable in tests and metrics: we want to be able to
   assert invariants “per profile” and track their behaviour over time.

5. **Preserve determinism**  
   Profiles must not introduce non‑determinism: for a fixed `(schema,
   options, profile, seed, ajvMajor, registryFingerprint)`, the generated
   data must remain deterministic.

---

## 4. Proposed Profile Taxonomy (High‑Level)

We propose an initial, high‑level taxonomy of three profiles:

### 4.1 `minimal` (default)

Intent: fast, predictable, coverage‑friendly generation with minimal values.

Characteristics:

- `validateFormats:false` on both AJV instances (annotate‑only mode), in
  line with the SPEC default.
- Generator:
  - uses per‑type minimal values (`""`, `0`, `{}`, `[]`, `false`, `null`)
    where compatible with the schema;
  - may generate *syntactically* obvious values for formats (e.g. `""` or
    `"00000000-0000-0000-0000-000000000000"` for `uuid`) but is not required
    to ensure they pass format validators;
  - MUST NOT depend on expensive, domain‑specific logic: values are
    intentionally simplistic and structural.
- Repair:
  - allowed to synthesize minimal values for `required` gaps;
  - applies bounded rectifications (numeric nudges, array growth/trimming,
    simple renames) as described in the SPEC.

Target use cases:

- quick feedback in CI,
- broad coverage runs where format realism is not required,
- debugging the core pipeline and coverage logic.

### 4.2 `realistic`

Intent: produce **plausible** data for most common patterns, while keeping
validation semantics aligned with `minimal` by default when using the same
AJV flags.

Characteristics (initial proposal):

- By default, `validateFormats:false` on both AJV instances (annotate‑only
  mode), keeping validation semantics identical to `minimal`. Implementations
  MAY allow an explicit combination where `realistic` is used together with
  `validateFormats:true` and the required plugins; in that case the stricter
  semantics must be surfaced clearly in configuration rather than as an
  implicit side effect of the profile.
- Generator:
  - still honours type/required constraints as in `minimal`,
  - additionally applies **domain‑aware generators** for common patterns:
    - valid‑looking UUIDs, emails, URIs,
    - realistic dates/times within configurable ranges,
    - non‑empty strings for obvious business fields (names, order numbers),
    - sample values for simple enums.
  - MUST remain deterministic for a fixed `(schema, options, profile, seed,
    ajvMajor, registryFingerprint)`, and MUST respect AJV flag parity between
    Source Ajv and planning/generation Ajv.
- Repair:
  - behaves as in `minimal`, but we prefer to rely less on it in this profile
    by shifting more work into Generator for the “Generator‑valid zone”.

Target use cases:

- developer QA where realistic data helps detect integration issues,
- manual exploration via CLI and reporter,
- demos and examples shipped with FoundryData.

### 4.3 `strict` (maps to Strict Data Compliance)

Intent: align with the SPEC’s optional **Strict Data Compliance** profile for
pipelines that require strong format guarantees.

Characteristics:

- `validateFormats:true` on both AJV instances, with `ajv-formats` (or an
  equivalent plugin) enabled for at least `email`, `uri`, `uuid`,
  and `date-time`.
- Generator:
  - MUST synthesize **format‑valid** values for these formats, per SPEC;
  - MAY be stricter on other patterns (e.g. leveraging regex hints to
    produce strings that fit simple patterns).
- Repair:
  - MUST NOT silently “downgrade” format validity (e.g. replacing a
    format‑valid string with an empty one) unless required to satisfy another
    schema constraint, in which case an explicit diagnostic MUST be emitted;
  - may still apply bounded corrections, but any correction that touches
    format‑bearing fields MUST preserve or improve validity relative to the
    profile’s AJV configuration, and MUST NOT hide format errors by turning
    invalid instances into superficially valid ones without clear diagnostics.

Target use cases:

- pipelines where FoundryData feeds downstream systems that rely on formats,
- regression suites for format‑heavy schemas,
- environments that want strong guarantees about data validity.

#### 4.4 Summary (v1)

The table below summarizes the intent and recommended defaults for the three
profiles in this brief:

| Profile   | Recommended `validateFormats` | Format behaviour                              | Reliance on Repair                | Intended use                                      |
| --------- | ----------------------------- | --------------------------------------------- | --------------------------------- | ------------------------------------------------- |
| `minimal` | `false`                       | Minimal / syntactic only, no guarantees       | High: fills structural gaps       | CI, broad coverage, pipeline and coverage debugging |
| `realistic` | `false` (default)          | Plausible values for common motifs            | Medium: Generator does more       | Developer QA, CLI exploration, demos              |
| `strict`  | `true`                        | Format‑valid values for core formats          | Medium/low: MUST preserve validity | Format‑sensitive pipelines, regression suites     |

---

## 5. Dimensions Controlled by Profiles

Each profile is a bundle of decisions along several dimensions:

- **AJV flags**  
  - `validateFormats`, `unicodeRegExp`, `strictSchema`, `multipleOfPrecision`,
    etc. Profiles must respect the SPEC’s AJV parity rules, and any change in
    AJV semantics (e.g. toggling `validateFormats`) must be an explicit,
    user‑visible choice.

- **Format generation behaviour**  
  - minimal vs realistic vs strictly valid for `email`, `uri`, `uuid`,
    `date-time`, and potentially domain‑specific formats later.

- **Reliance on Repair**  
  - how much Repair is allowed to fill structural gaps (`required`,
    `minItems`, etc.) vs how much the Generator is expected to handle up
    front (tying into the Generator‑vs‑Repair contract), including per‑profile
    invariants such as “no format validity downgrades in `strict`”.

- **Diversity and budgets**  
  - number of instances, diversity of values, and how aggressively guided
    coverage can steer generation, per profile, while remaining consistent
    with the global determinism requirements (seeded RNG, no hidden global
    state).

The exact mapping of these dimensions to profile settings will be refined in
a subsequent, more detailed SPEC or configuration document.

---

## 6. Compliance with SPEC

The proposed profiles are designed to stay **fully within** the canonical
SPEC:

- We do not change what AJV considers valid vs invalid for a given schema
  and set of flags.
- We respect **AJV flag parity** between Source Ajv and planning/generation
  Ajv (`spec://§13#ajv-flags-parity`).
- We map the `strict` profile directly to the SPEC’s optional Strict Data
  Compliance profile rather than inventing a divergent notion of strictness.
- For `minimal` and `realistic`, we remain in the allowed “annotate‑only”
  space, or in an explicit `validateFormats:true` configuration with the
  required plugins present.
- All profiles preserve the deterministic behaviour of FoundryData for a
  fixed `(canonical schema, OpenAPI spec, options including profile,
  seed, ajvMajor, registryFingerprint)`.

Profiles therefore shape the *style* and *realism* of generated data and
bundle recommended AJV flag configurations, but they do not introduce any
new notion of validity beyond what AJV already enforces for a given schema
and configuration.

---

## 7. Next Steps & Open Questions

Open questions:

- Where do we expose profile selection (CLI flags, API options, config files)?
- How opinionated should `realistic` be on domain semantics (e.g. money,
  payment methods, addresses) vs staying generic?
- Do we want per‑profile constraints on Repair (for example, limiting how
  often it can synthesize missing fields in `strict` mode)?
- How do profiles interact with coverage profiles (`quick`/`balanced`/
  `thorough`) without multiplying combinations excessively?

Suggested next steps:

1. Validate this high‑level taxonomy (`minimal` / `realistic` / `strict`) and
   align the `strict` profile with the SPEC’s Strict Data Compliance profile.
2. Add a short “Data profiles” section to `docs/testing-strategy.md` and
   `docs/tests-traceability.md` describing how tests reference profiles.
3. Introduce a minimal API/CLI configuration surface to select a profile,
   for example a `dataProfile: 'minimal' | 'realistic' | 'strict'` option
   in core APIs plus corresponding CLI flags, with explicit documentation of
   how this interacts with AJV flags.
4. Implement a first cut of `minimal` vs `realistic` behaviour for a small
   set of motifs (formats, ids, simple enums), instrumented with metrics so
   we can evaluate the impact before expanding the scope.
5. Specify, per profile, the Generator‑vs‑Repair contract (what each phase is
   expected to handle, and what invariants Repair must maintain) and publish
   a small, supported matrix of `{dataProfile, coverageProfile}` combinations
   to avoid combinatorial explosion while staying explicit about expected
   behaviour.
