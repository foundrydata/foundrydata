Task: 9400.9400004   Title: Document UUID + contains pattern as reference example
Anchors: [spec://§6#generator-repair-contract, spec://§9#generator, spec://§9#arrays-contains]
Touched files:
- docs/spec-canonical-json-schema-generator.md
- docs/examples/g-valid-uuid-contains.md
- ARCHITECTURE.md
- docs/COMPREHENSIVE_FEATURE_SUPPORT.md
- packages/core/src/types/options.ts
- packages/core/src/types/__tests__/options.test.ts
- packages/cli/src/profiles.ts
- packages/cli/src/__tests__/profiles.test.ts

Approach:
Make G_valid the default posture (strict) now that we do not need backward compatibility, and align docs/examples accordingly. In the canonical SPEC, adjust §6 to say the feature is on by default (strict Repair guard) and that disabling it is an explicit compat/legacy opt-out. Flip `PlanOptions.gValid` default to `true` in core defaults and update the options test expectations. In the CLI, change the default gvalid profile from “compat” to “strict” so runs inherit `gValid: true` unless users opt out; keep relaxed profile behaviour unchanged. Update `COMPREHENSIVE_FEATURE_SUPPORT.md` to note the new default and how to opt out (compat), and add cross-links from ARCHITECTURE.md and the UUID + `contains` example so the canonical motif is easy to find. Keep structural obligations and motifs unchanged; only the default posture and doc linkage move.

Risks/Unknowns:
- Avoid duplicating SPEC prose; cross-links must remain REFONLY-compliant and future-proof if paths move.
- Ensure the example references stay in sync with CLI defaults (compat/strict/relaxed) without suggesting new behaviours.

Parent bullets couverts: [KR1, KR2, KR3, KR4, DEL1, DEL2, DOD1, DOD3, TS1, TS2, TS3]

DoD:
- [x] G_valid defaults to strict in core and CLI
- [x] Docs/example cross-referenced and aligned with new default/opt-out path
- [x] build/typecheck/lint/test/bench OK

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
