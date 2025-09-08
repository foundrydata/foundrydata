/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
/**
 * Configuration options for the FoundryData generation pipeline
 *
 * All options are optional with conservative defaults. This provides
 * a comprehensive configuration system for controlling all aspects
 * of schema processing and data generation.
 */

/**
 * Rational arithmetic configuration for multipleOf operations
 */
export interface RationalOptions {
  /** Maximum bit length for rational numerator/denominator (default: 128) */
  maxRatBits?: number;
  /** Maximum bit length for LCM intermediate calculations (default: 128) */
  maxLcmBits?: number;
  /** Denominator cap for rational operations (default: undefined) */
  qCap?: number;
  /** Fallback strategy when rational caps exceeded (default: 'decimal') */
  fallback?: 'decimal' | 'float';
  /** Decimal precision for fallback calculations (default: 12) */
  decimalPrecision?: number;
}

/**
 * Output encoding options
 */
export interface EncodingOptions {
  /** How to encode BigInt values in JSON output (default: 'string') */
  bigintJSON?: 'string' | 'number' | 'error';
}

/**
 * Branch selection trial configuration
 */
export interface TrialsOptions {
  /** Number of trials per branch (default: 1..2) */
  perBranch?: number;
  /** Maximum branches to try in Top-K selection (default: 12) */
  maxBranchesToTry?: number;
  /** Skip trials when branch count exceeds this (default: 50) */
  skipTrialsIfBranchesGt?: number;
  /** Skip all trials, use score-only selection (default: false) */
  skipTrials?: boolean;
}

/**
 * Safety guards against infinite loops and deep nesting
 */
export interface GuardsOptions {
  /** Maximum NOT nesting depth allowed during normalization (default: 2) */
  maxGeneratedNotNesting?: number;
  /** Maximum effective NOT nesting for composer hints (default: 3) */
  maxEffectiveNotNesting?: number;
}

/**
 * Validation and compilation caching configuration
 */
export interface CacheOptions {
  /** Prefer WeakMap for object identity caching (default: true) */
  preferWeakMap?: boolean;
  /** Use $id for cache keys when present (default: true) */
  useId?: boolean;
  /** Use hash-based caching for schemas smaller than this (default: 1_000_000) */
  hashIfBytesLt?: number;
  /** LRU cache size for compiled validators (default: 64) */
  lruSize?: number;
}

/**
 * Complexity caps to prevent resource exhaustion
 */
export interface ComplexityOptions {
  /** Maximum oneOf branches to process (default: 200) */
  maxOneOfBranches?: number;
  /** Maximum anyOf branches to process (default: 500) */
  maxAnyOfBranches?: number;
  /** Maximum pattern properties to analyze (default: 64) */
  maxPatternProps?: number;
  /** Maximum enum values to process (default: 10_000) */
  maxEnumCardinality?: number;
  /** Maximum contains needs to track (default: 16) */
  maxContainsNeeds?: number;
  /** Maximum schema size in bytes (default: 2_000_000) */
  maxSchemaBytes?: number;
  /** Bail on unsat detection after this many attempts (default: 12) */
  bailOnUnsatAfter?: number;
}

/**
 * Fail-fast error handling configuration
 */
export interface FailFastOptions {
  /** How to handle external $ref resolution (default: 'error') */
  externalRefStrict?: 'error' | 'warn' | 'ignore';
  /** How to handle dynamic $ref resolution (default: 'note') */
  dynamicRefStrict?: 'warn' | 'note';
}

/**
 * Conditional schema processing configuration
 */
export interface ConditionalsOptions {
  /** Strategy for conditional processing (default: tied to rewriteConditionals) */
  strategy?: 'rewrite' | 'if-aware-lite' | 'repair-only';
  /** Minimum satisfaction strategy for then clauses (default: 'required-only') */
  minThenSatisfaction?:
    | 'discriminants-only'
    | 'required-only'
    | 'required+bounds';
}

/**
 * Complete configuration options for the FoundryData pipeline
 *
 * All options are optional and have conservative defaults.
 * See individual option interfaces for detailed descriptions.
 */
export interface PlanOptions {
  /** Normalization behavior for conditional schemas (default: 'safe') */
  rewriteConditionals?: 'never' | 'safe' | 'aggressive';
  /** Deep freeze schemas in debug mode to catch mutations (default: false) */
  debugFreeze?: boolean;

  /** Rational arithmetic configuration */
  rational?: RationalOptions;

  /** Output encoding configuration */
  encoding?: EncodingOptions;

  /** Branch selection trial configuration */
  trials?: TrialsOptions;

  /** Safety guards configuration */
  guards?: GuardsOptions;

  /** Caching configuration */
  cache?: CacheOptions;

  /** Enable metrics collection (default: true) */
  metrics?: boolean;
  /** Disable pattern overlap analysis optimization (default: false) */
  disablePatternOverlapAnalysis?: boolean;
  /** Disable deep freeze in production (default: false) */
  disableDeepFreeze?: boolean;

  /** Complexity caps configuration */
  complexity?: ComplexityOptions;

  /** Fail-fast error handling */
  failFast?: FailFastOptions;

  /** Conditional schema processing */
  conditionals?: ConditionalsOptions;
}

/**
 * Resolved configuration with all defaults applied
 *
 * This is the complete configuration object used internally
 * by the pipeline, with all optional values resolved to defaults.
 */
export interface ResolvedOptions {
  rewriteConditionals: 'never' | 'safe' | 'aggressive';
  debugFreeze: boolean;

  rational: Required<RationalOptions>;
  encoding: Required<EncodingOptions>;
  trials: Required<TrialsOptions>;
  guards: Required<GuardsOptions>;
  cache: Required<CacheOptions>;

  metrics: boolean;
  disablePatternOverlapAnalysis: boolean;
  disableDeepFreeze: boolean;

  complexity: Required<ComplexityOptions>;
  failFast: Required<FailFastOptions>;
  conditionals: Required<ConditionalsOptions>;
}

/**
 * Default values for all configuration options
 *
 * These are the conservative defaults used when options are not specified.
 * All defaults are designed to be safe and performant for typical use cases.
 */
export const DEFAULT_OPTIONS: ResolvedOptions = {
  rewriteConditionals: 'safe',
  debugFreeze: false,

  rational: {
    maxRatBits: 128,
    maxLcmBits: 128,
    fallback: 'decimal',
    decimalPrecision: 12,
  } as Required<RationalOptions>,

  encoding: {
    bigintJSON: 'string',
  },

  trials: {
    perBranch: 2, // 1..2 range, using upper bound as default
    maxBranchesToTry: 12,
    skipTrialsIfBranchesGt: 50,
    skipTrials: false,
  },

  guards: {
    maxGeneratedNotNesting: 2,
    maxEffectiveNotNesting: 3,
  },

  cache: {
    preferWeakMap: true,
    useId: true,
    hashIfBytesLt: 1_000_000,
    lruSize: 64,
  },

  metrics: true,
  disablePatternOverlapAnalysis: false,
  disableDeepFreeze: false,

  complexity: {
    maxOneOfBranches: 200,
    maxAnyOfBranches: 500,
    maxPatternProps: 64,
    maxEnumCardinality: 10_000,
    maxContainsNeeds: 16,
    maxSchemaBytes: 2_000_000,
    bailOnUnsatAfter: 12,
  },

  failFast: {
    externalRefStrict: 'error',
    dynamicRefStrict: 'note',
  },

  conditionals: {
    strategy: 'if-aware-lite', // Aligned with 'safe' rewriteConditionals default
    minThenSatisfaction: 'required-only',
  },
};

/**
 * Resolves partial user options into complete configuration
 *
 * Applies default values for any missing options and performs
 * basic validation of option combinations.
 *
 * @param userOptions - Partial user-provided configuration
 * @returns Complete resolved configuration with all defaults applied
 * @throws {Error} When invalid option combinations are detected
 */
export function resolveOptions(
  userOptions: Partial<PlanOptions> = {}
): ResolvedOptions {
  const resolved: ResolvedOptions = {
    ...DEFAULT_OPTIONS,
    ...userOptions,

    // Deep merge nested objects
    rational: { ...DEFAULT_OPTIONS.rational, ...userOptions.rational },
    encoding: { ...DEFAULT_OPTIONS.encoding, ...userOptions.encoding },
    trials: { ...DEFAULT_OPTIONS.trials, ...userOptions.trials },
    guards: { ...DEFAULT_OPTIONS.guards, ...userOptions.guards },
    cache: { ...DEFAULT_OPTIONS.cache, ...userOptions.cache },
    complexity: { ...DEFAULT_OPTIONS.complexity, ...userOptions.complexity },
    failFast: { ...DEFAULT_OPTIONS.failFast, ...userOptions.failFast },
    conditionals: {
      ...DEFAULT_OPTIONS.conditionals,
      ...userOptions.conditionals,
    },
  };

  // Validate option combinations
  validateOptions(resolved);

  // Apply conditional strategy alignment
  if (userOptions.rewriteConditionals && !userOptions.conditionals?.strategy) {
    resolved.conditionals.strategy = deriveConditionalsStrategy(
      resolved.rewriteConditionals
    );
  }

  return resolved;
}

/**
 * Derives conditionals strategy from rewriteConditionals setting
 *
 * @param rewriteConditionals - The rewrite setting
 * @returns Appropriate conditionals strategy
 */
function deriveConditionalsStrategy(
  rewriteConditionals: ResolvedOptions['rewriteConditionals']
): ResolvedOptions['conditionals']['strategy'] {
  switch (rewriteConditionals) {
    case 'never':
      return 'repair-only';
    case 'safe':
      return 'if-aware-lite';
    case 'aggressive':
      return 'rewrite';
    default:
      return 'if-aware-lite';
  }
}

/**
 * Validates resolved options for invalid combinations
 *
 * @param options - The resolved options to validate
 * @throws {Error} When invalid combinations are detected
 */
function validateOptions(options: ResolvedOptions): void {
  // Validate rational options
  if (options.rational.maxRatBits <= 0) {
    throw new Error('rational.maxRatBits must be positive');
  }
  if (options.rational.maxLcmBits <= 0) {
    throw new Error('rational.maxLcmBits must be positive');
  }
  if (
    options.rational.decimalPrecision < 1 ||
    options.rational.decimalPrecision > 100
  ) {
    throw new Error('rational.decimalPrecision must be between 1 and 100');
  }
  if (options.rational.qCap !== undefined && options.rational.qCap <= 0) {
    throw new Error('rational.qCap must be positive when specified');
  }

  // Validate trials options
  if (options.trials.perBranch <= 0) {
    throw new Error('trials.perBranch must be positive');
  }
  if (options.trials.maxBranchesToTry <= 0) {
    throw new Error('trials.maxBranchesToTry must be positive');
  }
  if (options.trials.skipTrialsIfBranchesGt <= 0) {
    throw new Error('trials.skipTrialsIfBranchesGt must be positive');
  }

  // Validate guards options
  if (options.guards.maxGeneratedNotNesting < 0) {
    throw new Error('guards.maxGeneratedNotNesting must be non-negative');
  }
  if (options.guards.maxEffectiveNotNesting < 0) {
    throw new Error('guards.maxEffectiveNotNesting must be non-negative');
  }

  // Validate cache options
  if (options.cache.hashIfBytesLt < 0) {
    throw new Error('cache.hashIfBytesLt must be non-negative');
  }
  if (options.cache.lruSize <= 0) {
    throw new Error('cache.lruSize must be positive');
  }

  // Validate complexity options
  if (options.complexity.maxOneOfBranches <= 0) {
    throw new Error('complexity.maxOneOfBranches must be positive');
  }
  if (options.complexity.maxAnyOfBranches <= 0) {
    throw new Error('complexity.maxAnyOfBranches must be positive');
  }
  if (options.complexity.maxPatternProps <= 0) {
    throw new Error('complexity.maxPatternProps must be positive');
  }
  if (options.complexity.maxEnumCardinality <= 0) {
    throw new Error('complexity.maxEnumCardinality must be positive');
  }
  if (options.complexity.maxContainsNeeds <= 0) {
    throw new Error('complexity.maxContainsNeeds must be positive');
  }
  if (options.complexity.maxSchemaBytes <= 0) {
    throw new Error('complexity.maxSchemaBytes must be positive');
  }
  if (options.complexity.bailOnUnsatAfter <= 0) {
    throw new Error('complexity.bailOnUnsatAfter must be positive');
  }
}
