import { describe, it, expect } from 'vitest';
import { resolveOptions, type PlanOptions } from '../options';

describe('PlanOptions', () => {
  describe('resolveOptions defaulting behavior', () => {
    it('should apply all defaults when no options provided', () => {
      const resolved = resolveOptions();

      // Normalization defaults
      expect(resolved.rewriteConditionals).toBe('never');
      expect(resolved.debugFreeze).toBe(false);

      // Rational defaults
      expect(resolved.rational.maxRatBits).toBe(128);
      expect(resolved.rational.maxLcmBits).toBe(128);
      expect(resolved.rational.qCap).toBeUndefined();
      expect(resolved.rational.fallback).toBe('decimal');
      expect(resolved.rational.decimalPrecision).toBe(12);

      // Encoding defaults
      expect(resolved.encoding.bigintJSON).toBe('string');

      // Trials defaults
      expect(resolved.trials.perBranch).toBe(2);
      expect(resolved.trials.maxBranchesToTry).toBe(12);
      expect(resolved.trials.skipTrialsIfBranchesGt).toBe(50);
      expect(resolved.trials.skipTrials).toBe(false);

      // Guards defaults
      expect(resolved.guards.maxGeneratedNotNesting).toBe(2);

      // Cache defaults
      expect(resolved.cache.preferWeakMap).toBe(true);
      expect(resolved.cache.useId).toBe(true);
      expect(resolved.cache.hashIfBytesLt).toBe(1_000_000);
      expect(resolved.cache.lruSize).toBe(64);

      // Metrics and toggles defaults
      expect(resolved.metrics).toBe(true);
      expect(resolved.disablePatternOverlapAnalysis).toBe(false);
      expect(resolved.disableDeepFreeze).toBe(false);

      // Complexity defaults
      expect(resolved.complexity.maxOneOfBranches).toBe(200);
      expect(resolved.complexity.maxAnyOfBranches).toBe(500);
      expect(resolved.complexity.maxPatternProps).toBe(64);
      expect(resolved.complexity.maxContainsNeeds).toBe(16);
      expect(resolved.complexity.maxSchemaBytes).toBe(2_000_000);
      expect(resolved.complexity.bailOnUnsatAfter).toBe(12);

      // Fail-fast defaults
      expect(resolved.failFast.externalRefStrict).toBe('error');
      expect(resolved.failFast.dynamicRefStrict).toBe('note');

      // Conditionals defaults
      expect(resolved.conditionals.strategy).toBe('if-aware-lite'); // default from DEFAULT_OPTIONS
      expect(resolved.conditionals.minThenSatisfaction).toBe('required-only');
      expect(resolved.conditionals.exclusivityStringTweak).toBe('preferNul');

      // Repair defaults
      expect(resolved.repair.mustCoverGuard).toBe(true);
    });

    it('should merge user options with defaults', () => {
      const userOptions: Partial<PlanOptions> = {
        rewriteConditionals: 'aggressive',
        debugFreeze: true,
        rational: {
          maxRatBits: 256,
          fallback: 'float',
          qCap: 1_000_000,
        },
        trials: {
          skipTrials: true,
        },
        conditionals: {
          exclusivityStringTweak: 'preferAscii',
        },
        repair: {
          mustCoverGuard: false,
        },
        metrics: false,
      };

      const resolved = resolveOptions(userOptions);

      // User overrides should be preserved
      expect(resolved.rewriteConditionals).toBe('aggressive');
      expect(resolved.debugFreeze).toBe(true);
      expect(resolved.rational.maxRatBits).toBe(256);
      expect(resolved.rational.fallback).toBe('float');
      expect(resolved.rational.qCap).toBe(1_000_000);
      expect(resolved.trials.skipTrials).toBe(true);
      expect(resolved.conditionals.exclusivityStringTweak).toBe('preferAscii');
      expect(resolved.metrics).toBe(false);
      expect(resolved.repair.mustCoverGuard).toBe(false);

      // Unspecified options should use defaults
      expect(resolved.rational.maxLcmBits).toBe(128); // default
      expect(resolved.rational.decimalPrecision).toBe(12); // default
      expect(resolved.trials.maxBranchesToTry).toBe(12); // default
      expect(resolved.encoding.bigintJSON).toBe('string'); // default
    });

    it('should derive conditionals.strategy from rewriteConditionals', () => {
      expect(
        resolveOptions({ rewriteConditionals: 'never' }).conditionals.strategy
      ).toBe('if-aware-lite');
      expect(
        resolveOptions({ rewriteConditionals: 'safe' }).conditionals.strategy
      ).toBe('rewrite');
      expect(
        resolveOptions({ rewriteConditionals: 'aggressive' }).conditionals
          .strategy
      ).toBe('rewrite');
    });
  });

  describe('validation', () => {
    it('should reject invalid rational options', () => {
      expect(() => resolveOptions({ rational: { maxRatBits: -1 } })).toThrow(
        'rational.maxRatBits must be positive'
      );

      expect(() => resolveOptions({ rational: { maxLcmBits: 0 } })).toThrow(
        'rational.maxLcmBits must be positive'
      );

      expect(() => resolveOptions({ rational: { qCap: -5 } })).toThrow(
        'rational.qCap must be positive'
      );

      expect(() =>
        resolveOptions({ rational: { decimalPrecision: -1 } })
      ).toThrow('rational.decimalPrecision must be between 1 and 100');
    });

    it('should reject invalid trials options', () => {
      expect(() => resolveOptions({ trials: { perBranch: 0 } })).toThrow(
        'trials.perBranch must be positive'
      );

      expect(() =>
        resolveOptions({ trials: { maxBranchesToTry: -1 } })
      ).toThrow('trials.maxBranchesToTry must be positive');

      expect(() =>
        resolveOptions({ trials: { skipTrialsIfBranchesGt: 0 } })
      ).toThrow('trials.skipTrialsIfBranchesGt must be positive');
    });

    it('should reject invalid guards options', () => {
      expect(() =>
        resolveOptions({ guards: { maxGeneratedNotNesting: -1 } })
      ).toThrow('guards.maxGeneratedNotNesting must be non-negative');
    });

    it('should reject invalid cache options', () => {
      expect(() => resolveOptions({ cache: { hashIfBytesLt: -1 } })).toThrow(
        'cache.hashIfBytesLt must be non-negative'
      );

      expect(() => resolveOptions({ cache: { lruSize: 0 } })).toThrow(
        'cache.lruSize must be positive'
      );
    });

    it('should reject invalid complexity options', () => {
      expect(() =>
        resolveOptions({ complexity: { maxOneOfBranches: 0 } })
      ).toThrow('complexity.maxOneOfBranches must be positive');

      expect(() =>
        resolveOptions({ complexity: { maxAnyOfBranches: -1 } })
      ).toThrow('complexity.maxAnyOfBranches must be positive');

      expect(() =>
        resolveOptions({ complexity: { maxPatternProps: 0 } })
      ).toThrow('complexity.maxPatternProps must be positive');

      // maxEnumCardinality removed from PlanOptions; ignored if present

      expect(() =>
        resolveOptions({ complexity: { maxContainsNeeds: 0 } })
      ).toThrow('complexity.maxContainsNeeds must be positive');

      expect(() =>
        resolveOptions({ complexity: { maxSchemaBytes: -1 } })
      ).toThrow('complexity.maxSchemaBytes must be positive');

      expect(() =>
        resolveOptions({ complexity: { bailOnUnsatAfter: 0 } })
      ).toThrow('complexity.bailOnUnsatAfter must be positive');
    });

    it('should accept valid options', () => {
      const validOptions: Partial<PlanOptions> = {
        rewriteConditionals: 'aggressive',
        rational: { maxRatBits: 256, qCap: 1000 },
        trials: { perBranch: 5, maxBranchesToTry: 20 },
        guards: { maxGeneratedNotNesting: 5 },
        cache: { lruSize: 128, hashIfBytesLt: 500_000 },
        complexity: { maxOneOfBranches: 100, maxSchemaBytes: 1_000_000 },
        repair: { mustCoverGuard: false },
      };

      expect(() => resolveOptions(validOptions)).not.toThrow();
      const resolved = resolveOptions(validOptions);
      expect(resolved.rational.maxRatBits).toBe(256);
      expect(resolved.trials.perBranch).toBe(5);
      expect(resolved.guards.maxGeneratedNotNesting).toBe(5);
      expect(resolved.repair.mustCoverGuard).toBe(false);
    });

    it('should reject invalid repair options', () => {
      expect(() =>
        resolveOptions({
          repair: { mustCoverGuard: 'nope' as unknown as boolean },
        })
      ).toThrow('repair.mustCoverGuard must be boolean');
    });
  });
});
