import { describe, expect, it } from 'vitest';

import { DIAGNOSTIC_CODES, DIAGNOSTIC_PHASES } from '../codes';
import {
  assertDiagnosticEnvelope,
  assertDiagnosticsForPhase,
  assertRunDiagnostics,
  type DiagnosticEnvelope,
} from '../validate';

describe('assertDiagnosticEnvelope', () => {
  it('accepts a valid envelope with compliant details', () => {
    expect(() =>
      assertDiagnosticEnvelope({
        code: DIAGNOSTIC_CODES.REGEX_COMPLEXITY_CAPPED,
        canonPath: '/properties/name',
        phase: DIAGNOSTIC_PHASES.COMPOSE,
        details: {
          patternSource: '^foo$',
          context: 'coverage',
        },
      })
    ).not.toThrow();
  });

  it('accepts UNSAT_REQUIRED_VS_PROPERTYNAMES and UNSAT_MINPROPERTIES_VS_COVERAGE detail shapes', () => {
    expect(() =>
      assertDiagnosticEnvelope({
        code: DIAGNOSTIC_CODES.UNSAT_REQUIRED_VS_PROPERTYNAMES,
        canonPath: '',
        phase: DIAGNOSTIC_PHASES.COMPOSE,
        details: {
          required: ['a', 'b'],
          propertyNames: ['a'],
        },
      })
    ).not.toThrow();

    expect(() =>
      assertDiagnosticEnvelope({
        code: DIAGNOSTIC_CODES.UNSAT_MINPROPERTIES_VS_COVERAGE,
        canonPath: '',
        phase: DIAGNOSTIC_PHASES.COMPOSE,
        details: {
          minProperties: 3,
          coverageSize: 2,
        },
      })
    ).not.toThrow();
  });

  it('accepts validation keyword diagnostics emitted during final validation', () => {
    expect(() =>
      assertDiagnosticEnvelope({
        code: DIAGNOSTIC_CODES.VALIDATION_KEYWORD_FAILED,
        canonPath: '/minLength',
        phase: DIAGNOSTIC_PHASES.VALIDATE,
        details: {
          keyword: 'minLength',
          message: 'must NOT be shorter than 5 characters',
          schemaPath: '#/minLength',
          instancePath: '/payload',
          params: { limit: 5 },
        },
      })
    ).not.toThrow();
  });

  it('accepts metrics with structured coverage and repair usage payloads', () => {
    expect(() =>
      assertDiagnosticEnvelope({
        code: DIAGNOSTIC_CODES.VALIDATION_KEYWORD_FAILED,
        canonPath: '',
        phase: DIAGNOSTIC_PHASES.VALIDATE,
        metrics: {
          validationsPerRow: 1,
          repairPassesPerRow: 0,
          repairActionsPerRow: 0,
          branchTrialsTried: 0,
          patternWitnessTried: 0,
          memoryPeakMB: 0,
          p50LatencyMs: 0,
          p95LatencyMs: 0,
          repair_tier1_actions: 0,
          repair_tier2_actions: 0,
          repair_tier3_actions: 0,
          repair_tierDisabled: 0,
          branchCoverageOneOf: { '#': { visited: [0], total: 1 } },
          enumUsage: { '#/status': { active: 2 } },
          repairUsageByMotif: [
            {
              motifId: 'gvalid:arrayContainsSimple',
              gValid: true,
              items: 1,
              itemsWithRepair: 0,
              actions: 0,
            },
          ],
        },
      })
    ).not.toThrow();
  });

  it('rejects metrics with malformed structured payloads', () => {
    expect(() =>
      assertDiagnosticEnvelope({
        code: DIAGNOSTIC_CODES.VALIDATION_KEYWORD_FAILED,
        canonPath: '',
        phase: DIAGNOSTIC_PHASES.VALIDATE,
        metrics: {
          branchCoverageOneOf: { '#': { visited: ['x'], total: 1 } },
        } as unknown as DiagnosticEnvelope['metrics'],
      })
    ).toThrow(/branchCoverageOneOf/);

    expect(() =>
      assertDiagnosticEnvelope({
        code: DIAGNOSTIC_CODES.VALIDATION_KEYWORD_FAILED,
        canonPath: '',
        phase: DIAGNOSTIC_PHASES.VALIDATE,
        metrics: {
          enumUsage: { '#': { yes: 'nope' } },
        } as unknown as DiagnosticEnvelope['metrics'],
      })
    ).toThrow(/enumUsage/);
  });

  it('rejects when details duplicate canonPath key anywhere in the payload', () => {
    expect(() =>
      assertDiagnosticEnvelope({
        code: DIAGNOSTIC_CODES.REGEX_COMPLEXITY_CAPPED,
        canonPath: '/properties/name',
        phase: DIAGNOSTIC_PHASES.COMPOSE,
        details: {
          nested: { canonPath: '/shadow' },
          patternSource: '^foo$',
          context: 'coverage',
        },
      })
    ).toThrow(/must not contain a canonPath property/);

    expect(() =>
      assertDiagnosticEnvelope({
        code: DIAGNOSTIC_CODES.MUSTCOVER_INDEX_MISSING,
        canonPath: '/properties/title',
        phase: DIAGNOSTIC_PHASES.COMPOSE,
        details: [{ canonPtr: '/legacy' }],
      })
    ).toThrow(/must not contain a canonPtr property/);
  });

  it('rejects details that violate the mini-schema for a known code', () => {
    expect(() =>
      assertDiagnosticEnvelope({
        code: DIAGNOSTIC_CODES.COMPLEXITY_CAP_ONEOF,
        canonPath: '/oneOf/0',
        phase: DIAGNOSTIC_PHASES.COMPOSE,
        // missing required observed field
        details: { limit: 10 },
      })
    ).toThrow(/do not match the expected shape/);
  });

  it('enforces EXTERNAL_REF_UNRESOLVED constraint when skipping validation', () => {
    expect(() =>
      assertDiagnosticEnvelope({
        code: DIAGNOSTIC_CODES.EXTERNAL_REF_UNRESOLVED,
        canonPath: '',
        phase: DIAGNOSTIC_PHASES.VALIDATE,
        details: {
          ref: 'file.json#/defs/x',
          skippedValidation: true,
          mode: 'strict',
        },
      })
    ).toThrow(/expected shape/);

    expect(() =>
      assertDiagnosticEnvelope({
        code: DIAGNOSTIC_CODES.EXTERNAL_REF_UNRESOLVED,
        canonPath: '',
        phase: DIAGNOSTIC_PHASES.VALIDATE,
        details: {
          ref: 'file.json#/defs/x',
          skippedValidation: true,
          mode: 'strict',
          policy: 'warn',
        },
      })
    ).toThrow(/expected shape/);

    expect(() =>
      assertDiagnosticEnvelope({
        code: DIAGNOSTIC_CODES.EXTERNAL_REF_UNRESOLVED,
        canonPath: '',
        phase: DIAGNOSTIC_PHASES.VALIDATE,
        details: {
          ref: 'file.json#/defs/x',
          skippedValidation: true,
          mode: 'lax',
        },
      })
    ).not.toThrow();
  });

  it('allows arbitrary details for unknown diagnostic codes while still enforcing the envelope', () => {
    expect(() =>
      assertDiagnosticEnvelope({
        code: 'CUSTOM_NOTE',
        canonPath: '/custom',
        phase: DIAGNOSTIC_PHASES.COMPOSE,
        details: { info: 'ok' },
      })
    ).not.toThrow();
  });
});

describe('assertDiagnosticsForPhase', () => {
  const baseRegexEnvelope = {
    code: DIAGNOSTIC_CODES.REGEX_COMPLEXITY_CAPPED,
    canonPath: '/properties/name',
    phase: DIAGNOSTIC_PHASES.COMPOSE,
    details: {
      patternSource: '^foo$',
      context: 'coverage',
    },
  };

  it('allows regex diagnostics in compose and normalize with matching context', () => {
    expect(() =>
      assertDiagnosticsForPhase(DIAGNOSTIC_PHASES.COMPOSE, [baseRegexEnvelope])
    ).not.toThrow();

    expect(() =>
      assertDiagnosticsForPhase(DIAGNOSTIC_PHASES.NORMALIZE, [
        {
          ...baseRegexEnvelope,
          details: { patternSource: '^foo$', context: 'rewrite' },
        },
      ])
    ).not.toThrow();
  });

  it('rejects regex diagnostics when context mismatches the phase', () => {
    expect(() =>
      assertDiagnosticsForPhase(DIAGNOSTIC_PHASES.COMPOSE, [
        {
          ...baseRegexEnvelope,
          details: { patternSource: '^foo$', context: 'rewrite' },
        },
      ])
    ).toThrow(/context="coverage"/);

    expect(() =>
      assertDiagnosticsForPhase(DIAGNOSTIC_PHASES.NORMALIZE, [
        {
          ...baseRegexEnvelope,
          phase: DIAGNOSTIC_PHASES.NORMALIZE,
        },
      ])
    ).toThrow(/context="rewrite"/);
  });

  it('rejects generator-only diagnostics in compose', () => {
    expect(() =>
      assertDiagnosticsForPhase(DIAGNOSTIC_PHASES.COMPOSE, [
        {
          code: DIAGNOSTIC_CODES.COMPLEXITY_CAP_PATTERNS,
          canonPath: '/pattern',
          phase: DIAGNOSTIC_PHASES.GENERATE,
          details: {
            reason: 'candidateBudget',
            tried: 5,
          },
        },
      ])
    ).toThrow(/not allowed/);
  });

  it('allows generator-only diagnostics during the generate phase', () => {
    expect(() =>
      assertDiagnosticsForPhase(DIAGNOSTIC_PHASES.GENERATE, [
        {
          code: DIAGNOSTIC_CODES.COMPLEXITY_CAP_PATTERNS,
          canonPath: '/pattern',
          phase: DIAGNOSTIC_PHASES.GENERATE,
          details: {
            reason: 'witnessDomainExhausted',
            tried: 1,
          },
        },
      ])
    ).not.toThrow();
  });
});

describe('assertRunDiagnostics', () => {
  it('accepts resolver run diagnostics with canonical shapes', () => {
    expect(() =>
      assertRunDiagnostics([
        {
          code: DIAGNOSTIC_CODES.RESOLVER_STRATEGIES_APPLIED,
          canonPath: '#',
          phase: DIAGNOSTIC_PHASES.COMPOSE,
          details: {
            strategies: ['local'],
            requested: ['local', 'remote'],
            cacheDir: '~/.cache',
            snapshotPath: '/tmp/resolver.snap',
            registryFingerprint: 'abc123',
          },
        },
        {
          code: DIAGNOSTIC_CODES.EXTERNAL_REF_STUBBED,
          canonPath: '#',
          phase: DIAGNOSTIC_PHASES.COMPOSE,
          details: {
            ref: 'https://example.com/offline.json',
            stubKind: 'emptySchema',
          },
        },
        {
          code: DIAGNOSTIC_CODES.RESOLVER_CACHE_HIT,
          canonPath: '#',
          phase: DIAGNOSTIC_PHASES.COMPOSE,
          details: {
            ref: 'https://example.com/external.json',
            contentHash: 'abc123',
            alias: 'asyncapi-3.0',
          },
        },
        {
          code: DIAGNOSTIC_CODES.RESOLVER_CACHE_MISS_FETCHED,
          canonPath: '#',
          phase: DIAGNOSTIC_PHASES.COMPOSE,
          details: {
            ref: 'https://example.com/remote.json',
            bytes: 42,
            contentHash: 'deadbeef',
          },
        },
        {
          code: DIAGNOSTIC_CODES.RESOLVER_OFFLINE_UNAVAILABLE,
          canonPath: '#',
          phase: DIAGNOSTIC_PHASES.COMPOSE,
          details: {
            ref: 'https://example.com/offline.json',
            reason: 'no-strategy',
            limit: 2,
            error: 'network-disabled',
          },
        },
        {
          code: DIAGNOSTIC_CODES.RESOLVER_SNAPSHOT_APPLIED,
          canonPath: '#',
          phase: DIAGNOSTIC_PHASES.COMPOSE,
          details: {
            path: '/tmp/resolver-snapshot.log',
            count: 2,
            fingerprint: 'f00',
          },
        },
        {
          code: DIAGNOSTIC_CODES.RESOLVER_SNAPSHOT_LOAD_FAILED,
          canonPath: '#',
          phase: DIAGNOSTIC_PHASES.COMPOSE,
          details: {
            path: '/tmp/resolver-snapshot.log',
            message: 'ENOENT',
            reason: 'parse-error',
            line: '{ invalid',
          },
        },
        {
          code: DIAGNOSTIC_CODES.RESOLVER_SNAPSHOT_FINGERPRINT_MISMATCH,
          canonPath: '#',
          phase: DIAGNOSTIC_PHASES.COMPOSE,
          details: {
            path: '/tmp/resolver-snapshot.log',
            declared: 'abc',
            actual: 'def',
          },
        },
        {
          code: DIAGNOSTIC_CODES.RESOLVER_ADD_SCHEMA_SKIPPED_DUPLICATE_ID,
          canonPath: '#',
          phase: DIAGNOSTIC_PHASES.COMPOSE,
          details: {
            ref: 'https://example.com/external.json',
            id: 'https://example.com/external.json',
            existingRef: 'https://example.com/external.json#',
            reason: 'uri-already-registered',
          },
        },
        {
          code: DIAGNOSTIC_CODES.EXTERNAL_REF_UNRESOLVED,
          canonPath: '#',
          phase: DIAGNOSTIC_PHASES.COMPOSE,
          details: {
            ref: 'https://example.com/missing.json',
            mode: 'strict',
            failingRefs: ['https://example.com/missing.json'],
          },
        },
      ])
    ).not.toThrow();
  });

  it('rejects resolver run diagnostics with non-root canonPath or malformed payloads', () => {
    expect(() =>
      assertRunDiagnostics([
        {
          code: DIAGNOSTIC_CODES.RESOLVER_STRATEGIES_APPLIED,
          canonPath: '/not-root',
          details: {
            strategies: ['local'],
            requested: ['local'],
            cacheDir: '~/.cache',
          },
        },
      ])
    ).toThrow(/canonPath/);

    expect(() =>
      assertRunDiagnostics([
        {
          code: DIAGNOSTIC_CODES.RESOLVER_CACHE_MISS_FETCHED,
          canonPath: '#',
          details: {
            ref: 'https://example.com/remote.json',
            contentHash: 'deadbeef',
          },
        },
      ] as DiagnosticEnvelope[])
    ).toThrow(/expected shape/i);
  });
});
