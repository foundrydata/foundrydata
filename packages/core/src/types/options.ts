/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
/* eslint-disable max-lines */
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
  /** Number of trials per branch (default: 2) */
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
  /** Maximum upward hops allowed when binding $dynamicRef scopes (default: 2) */
  maxDynamicScopeHops?: number;
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
  externalRefStrict?: 'error' | 'warn';
  /** How to handle dynamic $ref resolution (default: 'note') */
  dynamicRefStrict?: 'warn' | 'note';
}

/**
 * Pattern policy for AP:false coverage
 */
export interface PatternPolicyOptions {
  /**
   * Reaction to unsafe patterns when they would be required for must-cover proofs under AP:false.
   * Defaults to the strict posture ('error') unless the caller explicitly opts into 'warn'.
   */
  unsafeUnderApFalse?: 'error' | 'warn';
}

/**
 * Conditional schema processing configuration
 */
export interface ConditionalsOptions {
  /** Strategy for conditional processing (default: tied to rewriteConditionals) */
  strategy?: 'if-aware-lite' | 'repair-only';
  /** Minimum satisfaction strategy for then clauses (default: 'required-only') */
  minThenSatisfaction?:
    | 'discriminants-only'
    | 'required-only'
    | 'required+bounds';
  /** Preference for string tweaks during oneOf exclusivity (default: 'preferNul') */
  exclusivityStringTweak?: 'preferNul' | 'preferAscii';
}

/**
 * Pattern witness search configuration
 */
export interface PatternWitnessOptions {
  /**
   * Alphabet of Unicode code points used when synthesizing witnesses.
   * Defaults to "abcdefghijklmnopqrstuvwxyz0123456789_-" (see SPEC §23).
   */
  alphabet?: string;
  /**
   * Maximum number of Unicode code points allowed per candidate.
   * Defaults to 12.
   */
  maxLength?: number;
  /**
   * Maximum number of candidates evaluated before declaring a cap.
   * Defaults to 32768.
   */
  maxCandidates?: number;
}

/**
 * Name automaton / property-name enumeration configuration
 *
 * Controls bounded BFS search for object property names derived from
 * patternProperties / propertyNames context.
 */
export interface NameEnumOptions {
  /** Wall-clock budget in milliseconds for a single BFS run (default: 40). */
  maxMillis?: number;
  /** Global cap on expanded BFS nodes per run (default: 8000). */
  maxStates?: number;
  /** Maximum pending queue size during BFS (default: 16000). */
  maxQueue?: number;
  /** Maximum candidate length / depth in characters (default: 64). */
  maxDepth?: number;
  /** Maximum number of emitted names per BFS run (default: 32). */
  maxResults?: number;
  /**
   * Optional beam width. When set, BFS may apply a beam-style
   * prioritization over candidate prefixes based on a scoring
   * heuristic, while still respecting the other budgets.
   * Default: 128.
   */
  beamWidth?: number;
}

/**
 * Repair stage configuration
 */
export interface RepairPlanOptions {
  /** Enforce must-cover-based rename guard under AP:false (default: true) */
  mustCoverGuard?: boolean;
}

/**
 * Complete configuration options for the FoundryData pipeline
 *
 * All options are optional and have conservative defaults.
 * See individual option interfaces for detailed descriptions.
 */
export interface PlanOptions {
  /** Normalization behavior for conditional schemas (default: 'never') */
  rewriteConditionals?: 'never' | 'safe';
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
  /**
   * Enable coverage-only anchored-subset lifting for non-anchored patterns
   * when building name automata (default: true).
   */
  coverageAnchoredSubset?: boolean;

  /** Complexity caps configuration */
  complexity?: ComplexityOptions;

  /**
   * Enable experimental local SMT reasoning for arrays/numbers (default: false)
   */
  enableLocalSMT?: boolean;
  /**
   * Timeout budget in milliseconds for local SMT calls (default: 25)
   */
  solverTimeoutMs?: number;

  /** Fail-fast error handling */
  failFast?: FailFastOptions;
  /** Pattern policy configuration */
  patternPolicy?: PatternPolicyOptions;

  /** Conditional schema processing */
  conditionals?: ConditionalsOptions;

  /** Pattern witness search configuration */
  patternWitness?: PatternWitnessOptions;

  /** Name automaton / property-name enumeration configuration */
  nameEnum?: NameEnumOptions;

  /** Repair-stage configuration */
  repair?: RepairPlanOptions;

  /** External $ref resolver (Extension R1) */
  resolver?: {
    /** Resolution strategies. Default: ['local'] */
    strategies?: Array<'local' | 'remote' | 'schemastore'>;
    /** Local on-disk cache directory. Default: "~/.foundrydata/cache" */
    cacheDir?: string;
    /**
     * Optional curated snapshot file containing pre-fetched registry entries.
     * When provided, remote fetch is disabled and the snapshot is used instead.
     */
    snapshotPath?: string;
    /** Planning-time substitution for unresolved external refs in Lax. Default: 'none'. */
    stubUnresolved?: 'none' | 'emptySchema';
    /** Bounds (determinism & safety) */
    maxDocs?: number; // default: 64
    maxRefDepth?: number; // default: 16
    maxBytesPerDoc?: number; // default: 5 MiB
    timeoutMs?: number; // default: 8000
    followRedirects?: number; // default: 3
    acceptYaml?: boolean; // default: true
    /** Optional allowlist of hostnames; empty ⇒ no host restriction. */
    allowlist?: string[];
    /**
     * Hydrate the final validation AJV with the resolver registry when Extension R1 is active.
     * When true, successfully resolved external $ref targets participate in final validation.
     * Default: true.
     */
    hydrateFinalAjv?: boolean;
  };
}

/**
 * Resolved configuration with all defaults applied
 *
 * This is the complete configuration object used internally
 * by the pipeline, with all optional values resolved to defaults.
 */
export interface ResolvedOptions {
  rewriteConditionals: 'never' | 'safe';
  debugFreeze: boolean;

  // All rational fields required except qCap remains optional
  rational: Required<Omit<RationalOptions, 'qCap'>> & { qCap?: number };
  encoding: Required<EncodingOptions>;
  trials: Required<TrialsOptions>;
  guards: Required<GuardsOptions>;
  cache: Required<CacheOptions>;

  metrics: boolean;
  enableLocalSMT: boolean;
  solverTimeoutMs: number;
  disablePatternOverlapAnalysis: boolean;
  disableDeepFreeze: boolean;
  coverageAnchoredSubset: boolean;

  complexity: Required<ComplexityOptions>;
  failFast: Required<FailFastOptions>;
  patternPolicy: Required<PatternPolicyOptions>;
  conditionals: Required<ConditionalsOptions>;
  patternWitness: Required<PatternWitnessOptions>;
  nameEnum: Required<NameEnumOptions>;
  repair: Required<RepairPlanOptions>;
  resolver: Required<NonNullable<PlanOptions['resolver']>>;
}

/**
 * Default values for all configuration options
 *
 * These are the conservative defaults used when options are not specified.
 * All defaults are designed to be safe and performant for typical use cases.
 */
export const DEFAULT_OPTIONS: ResolvedOptions = {
  rewriteConditionals: 'never',
  debugFreeze: false,

  rational: {
    maxRatBits: 128,
    maxLcmBits: 128,
    fallback: 'decimal',
    decimalPrecision: 12, // aligns with AJV tolerance
  },

  encoding: {
    bigintJSON: 'string', // applies to data outputs, not logs
  },

  trials: {
    perBranch: 2, // 1..2 range, using upper bound as default
    maxBranchesToTry: 12,
    skipTrialsIfBranchesGt: 50,
    skipTrials: false,
  },

  guards: {
    maxGeneratedNotNesting: 2,
    maxDynamicScopeHops: 2,
  },

  cache: {
    preferWeakMap: true,
    useId: true,
    hashIfBytesLt: 1_000_000,
    lruSize: 64,
  },

  metrics: true,
  enableLocalSMT: false,
  solverTimeoutMs: 25,
  disablePatternOverlapAnalysis: false,
  disableDeepFreeze: false,
  coverageAnchoredSubset: true,

  complexity: {
    maxOneOfBranches: 200,
    maxAnyOfBranches: 500,
    maxPatternProps: 64,
    maxContainsNeeds: 16,
    maxSchemaBytes: 2_000_000,
    bailOnUnsatAfter: 12,
  },

  failFast: {
    externalRefStrict: 'error',
    dynamicRefStrict: 'note',
  },

  patternPolicy: {
    unsafeUnderApFalse: 'error',
  },

  conditionals: {
    strategy: 'if-aware-lite', // default mapping for rewriteConditionals:'never'
    minThenSatisfaction: 'required-only',
    exclusivityStringTweak: 'preferNul',
  },
  patternWitness: {
    alphabet: 'abcdefghijklmnopqrstuvwxyz0123456789_-',
    maxLength: 12,
    maxCandidates: 32768,
  },
  nameEnum: {
    maxMillis: 40,
    maxStates: 8000,
    maxQueue: 16000,
    maxDepth: 64,
    maxResults: 32,
    beamWidth: 128,
  },
  repair: {
    mustCoverGuard: true,
  },
  resolver: {
    strategies: ['local'],
    cacheDir: pathForDefaultCacheDir(),
    snapshotPath: '',
    stubUnresolved: 'none',
    maxDocs: 64,
    maxRefDepth: 16,
    maxBytesPerDoc: 5 * 1024 * 1024,
    timeoutMs: 8000,
    followRedirects: 3,
    acceptYaml: true,
    allowlist: [],
    hydrateFinalAjv: true,
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
    patternPolicy: {
      ...DEFAULT_OPTIONS.patternPolicy,
      ...userOptions.patternPolicy,
    },
    conditionals: {
      ...DEFAULT_OPTIONS.conditionals,
      ...userOptions.conditionals,
    },
    patternWitness: {
      ...DEFAULT_OPTIONS.patternWitness,
      ...userOptions.patternWitness,
    },
    nameEnum: {
      ...DEFAULT_OPTIONS.nameEnum,
      ...userOptions.nameEnum,
    },
    repair: {
      ...DEFAULT_OPTIONS.repair,
      ...userOptions.repair,
    },
    resolver: {
      ...DEFAULT_OPTIONS.resolver,
      ...(userOptions.resolver ?? {}),
    },
  };

  // Validate option combinations
  validateOptions(resolved);

  // Apply conditional strategy alignment when user set rewriteConditionals but did not set strategy
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
      return 'if-aware-lite';
    case 'safe':
      return 'if-aware-lite';
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
  if (
    options.rewriteConditionals !== 'never' &&
    options.rewriteConditionals !== 'safe'
  ) {
    throw new Error("rewriteConditionals must be 'never' or 'safe'");
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
  if (options.guards.maxDynamicScopeHops <= 0) {
    throw new Error('guards.maxDynamicScopeHops must be positive');
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
  if (options.complexity.maxContainsNeeds <= 0) {
    throw new Error('complexity.maxContainsNeeds must be positive');
  }
  if (options.complexity.maxSchemaBytes <= 0) {
    throw new Error('complexity.maxSchemaBytes must be positive');
  }
  if (options.complexity.bailOnUnsatAfter <= 0) {
    throw new Error('complexity.bailOnUnsatAfter must be positive');
  }

  if (typeof options.enableLocalSMT !== 'boolean') {
    throw new Error('enableLocalSMT must be boolean');
  }
  if (
    !Number.isFinite(options.solverTimeoutMs) ||
    options.solverTimeoutMs <= 0
  ) {
    throw new Error('solverTimeoutMs must be a positive finite number');
  }

  // Validate pattern witness options
  if (options.patternWitness.maxLength <= 0) {
    throw new Error('patternWitness.maxLength must be positive');
  }
  if (options.patternWitness.maxCandidates <= 0) {
    throw new Error('patternWitness.maxCandidates must be positive');
  }
  if (
    options.patternWitness.alphabet !== undefined &&
    typeof options.patternWitness.alphabet !== 'string'
  ) {
    throw new Error('patternWitness.alphabet must be a string when provided');
  }

  // Validate name enumeration options
  if (
    options.nameEnum.maxMillis !== undefined &&
    options.nameEnum.maxMillis <= 0
  ) {
    throw new Error('nameEnum.maxMillis must be positive when specified');
  }
  if (
    options.nameEnum.maxStates !== undefined &&
    options.nameEnum.maxStates <= 0
  ) {
    throw new Error('nameEnum.maxStates must be positive when specified');
  }
  if (
    options.nameEnum.maxQueue !== undefined &&
    options.nameEnum.maxQueue <= 0
  ) {
    throw new Error('nameEnum.maxQueue must be positive when specified');
  }
  if (
    options.nameEnum.maxDepth !== undefined &&
    options.nameEnum.maxDepth <= 0
  ) {
    throw new Error('nameEnum.maxDepth must be positive when specified');
  }
  if (
    options.nameEnum.maxResults !== undefined &&
    options.nameEnum.maxResults <= 0
  ) {
    throw new Error('nameEnum.maxResults must be positive when specified');
  }
  if (
    options.nameEnum.beamWidth !== undefined &&
    options.nameEnum.beamWidth <= 0
  ) {
    throw new Error('nameEnum.beamWidth must be positive when specified');
  }

  const tweak = options.conditionals.exclusivityStringTweak;
  if (tweak !== 'preferNul' && tweak !== 'preferAscii') {
    throw new Error(
      "conditionals.exclusivityStringTweak must be 'preferNul' or 'preferAscii'"
    );
  }
  const strategy = options.conditionals.strategy;
  if (strategy !== 'if-aware-lite' && strategy !== 'repair-only') {
    throw new Error(
      "conditionals.strategy must be 'if-aware-lite' or 'repair-only'"
    );
  }

  const unsafePolicy = options.patternPolicy.unsafeUnderApFalse;
  if (unsafePolicy !== 'error' && unsafePolicy !== 'warn') {
    throw new Error(
      "patternPolicy.unsafeUnderApFalse must be 'error' or 'warn'"
    );
  }
  const externalPolicy = options.failFast.externalRefStrict;
  if (externalPolicy !== 'error' && externalPolicy !== 'warn') {
    throw new Error("failFast.externalRefStrict must be 'error' or 'warn'");
  }

  if (typeof options.repair.mustCoverGuard !== 'boolean') {
    throw new Error('repair.mustCoverGuard must be boolean');
  }

  // Validate resolver options
  const r = options.resolver;
  const strategiesOk = Array.isArray(r.strategies) && r.strategies.length > 0;
  if (!strategiesOk) {
    throw new Error('resolver.strategies must be a non-empty array');
  }
  if (r.maxDocs <= 0) throw new Error('resolver.maxDocs must be positive');
  if (r.maxRefDepth <= 0)
    throw new Error('resolver.maxRefDepth must be positive');
  if (r.maxBytesPerDoc <= 0)
    throw new Error('resolver.maxBytesPerDoc must be positive');
  if (r.timeoutMs <= 0) throw new Error('resolver.timeoutMs must be positive');
  if (typeof r.hydrateFinalAjv !== 'boolean') {
    throw new Error('resolver.hydrateFinalAjv must be boolean');
  }
  if (r.snapshotPath !== undefined && typeof r.snapshotPath !== 'string') {
    throw new Error('resolver.snapshotPath must be a string when provided');
  }
}

// Utility to provide default cache dir without importing os at module top for SSR friendliness
function pathForDefaultCacheDir(): string {
  // Use POSIX-style tilde; will be expanded by resolver implementation before I/O
  return '~/.foundrydata/cache';
}
