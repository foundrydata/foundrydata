# Architecture Brief — External `$ref` Resolver (Extension R1)

## 1. Purpose & Context

This document frames how FoundryData should use and expose the **External
`$ref` Resolver (Extension R1)** defined in the canonical SPEC.

The SPEC defines R1 as an optional, pre‑pipeline extension that:

- may perform HTTP(S) fetches to hydrate a local registry/cache,
- remains strictly outside core phases (`Normalize → Compose → Generate → Repair → Validate`),
- guarantees determinism via a `resolver.registryFingerprint`,
- and surfaces behaviour through dedicated diagnostics and metrics.

Within this envelope, implementations are free to decide:

- how aggressively to fetch/cache external schemas,
- how to manage snapshots and offline runs,
- and how to expose resolver configuration to users.

This brief captures the FoundryData‑specific policy and UX for R1.

---

## 2. Problem Statement

Today, the resolver code exists and the SPEC is detailed, but:

- We do not have a **clear story** for:
  - when R1 is enabled or disabled,
  - how registry snapshots are managed and reused,
  - what guarantees users can expect in offline CI or long‑running projects.
- External `$ref` resolution can influence:
  - which schemas are actually validated (vs stubbed),
  - how reproducible runs are over time as remote schemas evolve,
  - performance and failure modes.

Without an explicit policy, behaviour may appear ad‑hoc or surprising
to users and to tests that rely on cross‑schema coverage.

---

## 3. Goals

For FoundryData, the resolver extension should:

1. **Preserve core determinism guarantees**  
   - Runs must be reproducible for a fixed `(schema, options, seed,
     resolver.registryFingerprint, AJV major)`.
   - Core phases must remain I/O‑free; all network activity is confined to
     the R1 pre‑phase.

2. **Support both online and offline workflows**  
   - When network is available and allowed, we should be able to hydrate a
     registry from remote schemas.
   - When offline or in locked‑down CI, runs should still be reproducible
     against a known registry snapshot.

3. **Make resolver behaviour observable**  
   - Users should be able to see which `$ref` were resolved, stubbed, or
     skipped, via diagnostics and metrics.

4. **Respect security and resource bounds**  
   - Use allow‑lists, depth/size/time caps, and separate cache directories
     per project when appropriate.

---

## 4. Spec Constraints (Summary)

Key normative points from the SPEC:

- Core phases perform **no I/O** in any mode. R1 is a separate pre‑phase.
- `resolver.strategies` controls which sources are allowed:
  - `local` — intra‑document only (no network).
  - `remote` — allow HTTP(S) fetch.
  - `schemastore` — restrict hosts to `json.schemastore.org` (and aliases).
- A local on‑disk cache stores fetched documents:
  - bounded by `resolver.maxDocs`, `resolver.maxRefDepth`, `resolver.maxBytesPerDoc`,
    `resolver.timeoutMs`, `resolver.followRedirects`.
- A **registry fingerprint** (`resolver.registryFingerprint`) derived from the
  in‑memory registry must be included in compose/plan cache keys whenever R1
  is enabled, to prevent cross‑state reuse.
- `resolver.stubUnresolved:'emptySchema'` (in Lax) allows planning‑time stubs
  for unresolved external `$ref`, with diagnostics and optional final
  validation skip.
- Resolver behaviour (cache hits, misses, offline failures) must be surfaced
  via run‑level diagnostics under `Compose.diag.run`.

These constraints are non‑negotiable; the design space is how we package
and expose them.

---

## 5. Modes & Profiles for Resolver Behaviour

We can think of resolver behaviour along two axes:

1. **Network mode**
   - **Offline** — no network, only local cache/registry.
   - **Online** — network allowed to hydrate the cache.

2. **Strictness mode** (loosely aligning with Strict vs Lax from SPEC)
   - **Strict** — unresolved external `$ref` are hard errors; no stubbing.
   - **Lax** — unresolved external `$ref` may be stubbed (`{}`) for planning
     with warnings; final validation may be skipped per SPEC rules.

For FoundryData, we can define a few high‑level profiles:

- `resolver:strict-local`  
  - `strategies:['local']`, no network, `stubUnresolved:'none'`.  
  - Use only intra‑document refs or pre‑loaded registry; unresolved external
    `$ref` cause hard errors.

- `resolver:lax-local`  
  - `strategies:['local']`, `stubUnresolved:'emptySchema'` in Lax mode.  
  - Planning continues with stubs; diagnostics make unresolved refs visible.

- `resolver:online`  
  - `strategies:['local','remote','schemastore']`, `stubUnresolved:'none'`
    or `'emptySchema'` depending on strictness.  
  - Cache hydrated from allowed hosts; registry snapshot fingerprinted.

These profiles can be mapped to CLI flags (`--resolve`, `--compat`, etc.) and
to library options, without changing core semantics.

---

## 6. Registry Snapshots & Reproducibility

The SPEC introduces `resolver.registryFingerprint` specifically for
determinism. FoundryData should build on this:

- **Snapshot story**  
  - Treat the in‑memory registry as a snapshot of the world at a given time.
  - Serialize and version these snapshots for environments that must be
    reproducible (CI, production‑like test environments).

- **Cache & snapshot interplay**
  - Use the on‑disk cache as a **source** for building registries; do not
    treat the cache itself as the registry.
  - When a snapshot is explicitly loaded, network fetch must be disabled
    regardless of `strategies` to ensure runs use only the snapshot and
    cache contents.

- **User‑facing guarantees**
  - Given a fixed registry snapshot and options, reruns are deterministic.
  - Changes in remote schemas are picked up only when a new snapshot is
    built; cache differences alone must not silently change behaviour.

---

## 7. Security & Resource Boundaries

R1 introduces obvious security and resource concerns:

- **Security / host control**
  - Default to conservative host allow‑lists (`schemastore` profile).
  - Expose explicit configuration for additional hosts (e.g. `--allow-host`).
  - Avoid following redirects outside the allowed host set.

- **Resource bounds**
  - Honour and surface SPEC bounds (`maxDocs`, `maxRefDepth`, `maxBytesPerDoc`,
    `timeoutMs`, `followRedirects`).
  - Treat bound violations as “reference unavailable for this run”, not as
    opportunities to silently continue; always emit appropriate diagnostics.

- **Cache layout**
  - Use a predictable cache directory layout per SPEC, but consider:
    - separate cache roots per project or workspace,
    - explicit user control over `cacheDir` for multi‑tenant setups.

---

## 8. Observability & Diagnostics

Resolver behaviour must be visible and diagnosable:

- Use run‑level diagnostics in `Compose.diag.run` for:
  - `RESOLVER_STRATEGIES_APPLIED`,
  - `RESOLVER_CACHE_HIT` / `RESOLVER_CACHE_MISS_FETCHED`,
  - `RESOLVER_OFFLINE_UNAVAILABLE`,
  - `EXTERNAL_REF_STUBBED`, `EXTERNAL_REF_UNRESOLVED`, etc.

- Integrate resolver notes into:
  - coverage reports (e.g. as part of run metadata),
  - CLI summaries in debug/profiling modes.

- Consider lightweight metrics such as:
  - count of resolved external `$ref`,
  - count of stubbed vs unresolved refs,
  - cache hit ratio for external schemas.

These signals help explain why a given run behaves differently across
environments (online vs offline, warm vs cold cache).

---

## 9. Integration with Testing & Profiles

Testing should explicitly cover resolver behaviour:

- Unit tests for resolver options, cache layout, and allow‑lists.
- Integration tests for:
  - strict vs lax behaviour on unresolved refs,
  - online vs offline runs with the same corpus and seeds,
  - registry snapshot determinism (same fingerprint ⇒ same behaviour).

Profiles (data, coverage, resolver) should be combined carefully:

- Keep the resolver story orthogonal to coverage/data profiles where
  possible (e.g. `strict` data profile does not automatically imply
  `resolver:online`).
- For CI and production‑like environments, prefer:
  - explicit registry snapshots, and
  - `resolver:strict-local` or `resolver:lax-local` depending on policy.

---

## 10. Next Steps & Open Questions

Open questions:

- How do we expose snapshot management to users (CLI commands, config files,
  API)?  
- What is the default resolver profile for:
  - local development,
  - CI,
  - production‑like environments?
- Do we need a “dry‑run” or “audit” mode that scans schemas and reports
  external `$ref` resolution status without running the full pipeline?

Suggested next steps:

1. Audit current resolver usage in the codebase and align it with the
   profiles described here.
2. Define defaults per environment (dev/CI) and document them in user docs.
3. Implement explicit snapshot load/save paths and ensure that
   `resolver.registryFingerprint` is surfaced in relevant reports.
4. Add tests that assert determinism and diagnostics behaviour across
   online/offline and strict/lax configurations.

