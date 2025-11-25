# FoundryData Changelog

All notable changes to this project will be documented in this file. The format follows Semantic Versioning 2.0.0 and the release workflow defined in the FoundryData specification.

## [Unreleased]
- Pending changes



## [0.1.1] - 2025-11-25
- Add CLI README for npm package.

## [0.1.0] - 2025-11-25
- Core: first public AJV-first engine for JSON Schema and OpenAPI 3.1 with a 5-stage Normalize → Compose → Generate → Repair → Validate pipeline.
- CLI: foundrydata generate/openapi commands with deterministic seeds, JSON/NDJSON output and CI-friendly metrics.
- Diagnostics: structured diagnostic envelopes with documented codes, complexity guardrails and resolver notes.
- Bench: initial performance profiles and guardrails (p95 latency and memory caps) on a curated real-world schema corpus.
