/* eslint-disable max-lines */
/**
 * ================================================================================
 * BUSINESS SCENARIO ARBITRARIES - FOUNDRYDATA TESTING v2.1
 *
 * Fast-check arbitraries for generating business testing scenarios with load
 * parameters, error configurations, and metadata for comprehensive test coverage.
 * ================================================================================
 */

import * as fc from 'fast-check';

/**
 * Business scenario types for different testing contexts
 */
export type BusinessScenarioType = 'normal' | 'edge' | 'peak' | 'error';

/**
 * Error configuration for business scenarios
 */
export interface ErrorConfig {
  /** Error rate percentage (0-100) */
  rate: number;
  /** Types of errors to simulate */
  types: readonly string[];
  /** Whether errors are retryable */
  retryable: boolean;
  /** Maximum number of retries */
  maxRetries: number;
}

/**
 * Load parameters for business scenario testing
 */
export interface LoadParameters {
  /** Number of concurrent users */
  users: number;
  /** Requests per second */
  requestsPerSecond: number;
  /** Test duration in seconds */
  duration: number;
  /** Ramp up time in seconds */
  rampUp: number;
  /** Ramp down time in seconds */
  rampDown: number;
}

/**
 * Distribution configuration for scenario types
 */
export interface ScenarioDistribution {
  /** Normal scenario weight (0-1) */
  normal: number;
  /** Edge case scenario weight (0-1) */
  edge: number;
  /** Error scenario weight (0-1) */
  error: number;
}

/**
 * Edge case configuration flags
 */
export interface EdgeCaseFlags {
  /** Include boundary value testing */
  boundaries: boolean;
  /** Include null/undefined handling */
  nullish: boolean;
  /** Include empty collections */
  empty: boolean;
  /** Include maximum size collections */
  maxSize: boolean;
  /** Include unicode edge cases */
  unicode: boolean;
}

/**
 * Business scenario metadata
 */
export interface BusinessScenarioMetadata {
  /** Scenario name */
  name: string;
  /** Scenario description */
  description: string;
  /** Scenario tags for categorization */
  tags: readonly string[];
  /** Scenario version */
  version: string;
}

/**
 * Complete business scenario configuration
 */
export interface BusinessScenario {
  /** Scenario type */
  type: BusinessScenarioType;
  /** Load testing parameters */
  loadParameters: LoadParameters;
  /** Distribution ratios (must sum to 1) */
  distribution: ScenarioDistribution;
  /** Error configuration */
  errorConfig: ErrorConfig;
  /** Edge case flags */
  edgeCases: EdgeCaseFlags;
  /** Deterministic seed for reproducibility */
  seed: number;
  /** Scenario metadata */
  metadata: BusinessScenarioMetadata;
}

/**
 * Helper to create distribution ratios that sum to 1
 */
export const createDistributionRatios =
  (): fc.Arbitrary<ScenarioDistribution> =>
    fc
      .tuple(
        fc.float({ min: Math.fround(0.1), max: Math.fround(0.8) }), // normal
        fc.float({ min: Math.fround(0.1), max: Math.fround(0.4) }), // edge
        fc.float({ min: Math.fround(0.1), max: Math.fround(0.4) }) // error
      )
      .map(([normal, edge, error]) => {
        // Normalize to sum to 1
        const total = normal + edge + error;
        return {
          normal: Number((normal / total).toFixed(3)),
          edge: Number((edge / total).toFixed(3)),
          error: Number((error / total).toFixed(3)),
        } as const;
      })
      .filter(
        ({ normal, edge, error }) => Math.abs(normal + edge + error - 1) < 0.001
      );

/**
 * Arbitrary for generating error configurations
 */
export const errorConfigArbitrary: fc.Arbitrary<ErrorConfig> = fc.record({
  rate: fc.float({ min: Math.fround(0.1), max: Math.fround(25.0) }),
  types: fc.array(
    fc.constantFrom(
      'network_timeout',
      'connection_refused',
      'service_unavailable',
      'rate_limit_exceeded',
      'validation_error',
      'authentication_failed',
      'authorization_denied',
      'internal_server_error'
    ),
    { minLength: 1, maxLength: 4 }
  ),
  retryable: fc.boolean(),
  maxRetries: fc.integer({ min: 0, max: 5 }),
});

/**
 * Arbitrary for generating load parameters
 */
export const loadParametersArbitrary: fc.Arbitrary<LoadParameters> = fc.record({
  users: fc.integer({ min: 1, max: 10000 }),
  requestsPerSecond: fc.integer({ min: 1, max: 1000 }),
  duration: fc.integer({ min: 10, max: 3600 }), // 10 seconds to 1 hour
  rampUp: fc.integer({ min: 0, max: 300 }), // 0 to 5 minutes
  rampDown: fc.integer({ min: 0, max: 300 }), // 0 to 5 minutes
});

/**
 * Arbitrary for generating edge case flags
 */
export const edgeCaseFlagsArbitrary: fc.Arbitrary<EdgeCaseFlags> = fc.record({
  boundaries: fc.boolean(),
  nullish: fc.boolean(),
  empty: fc.boolean(),
  maxSize: fc.boolean(),
  unicode: fc.boolean(),
});

/**
 * Arbitrary for generating business scenario metadata
 */
export const businessScenarioMetadataArbitrary: fc.Arbitrary<BusinessScenarioMetadata> =
  fc.record({
    name: fc.string({ minLength: 5, maxLength: 50 }),
    description: fc.string({ minLength: 10, maxLength: 200 }),
    tags: fc.array(
      fc.constantFrom(
        'load_test',
        'stress_test',
        'integration_test',
        'performance_test',
        'regression_test',
        'smoke_test',
        'api_test',
        'database_test'
      ),
      { minLength: 1, maxLength: 3 }
    ),
    version: fc
      .tuple(
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 100 })
      )
      .map(([major, minor, patch]) => `${major}.${minor}.${patch}`),
  });

/**
 * Main arbitrary for generating complete business scenarios
 */
export const businessScenarioArbitrary: fc.Arbitrary<BusinessScenario> =
  fc.record({
    type: fc.constantFrom('normal', 'edge', 'peak', 'error'),
    loadParameters: loadParametersArbitrary,
    distribution: createDistributionRatios(),
    errorConfig: errorConfigArbitrary,
    edgeCases: edgeCaseFlagsArbitrary,
    seed: fc.integer({ min: 100000, max: 999999 }),
    metadata: businessScenarioMetadataArbitrary,
  });

/**
 * Scenario-specific arbitraries for targeted testing
 */
export const normalScenarioArbitrary: fc.Arbitrary<BusinessScenario> =
  businessScenarioArbitrary.map((scenario) => ({
    ...scenario,
    type: 'normal' as const,
    loadParameters: {
      ...scenario.loadParameters,
      users: Math.min(scenario.loadParameters.users, 100),
      requestsPerSecond: Math.min(
        scenario.loadParameters.requestsPerSecond,
        50
      ),
    },
    errorConfig: {
      ...scenario.errorConfig,
      rate: Math.min(scenario.errorConfig.rate, 1.0), // Very low error rate for normal scenarios
    },
  }));

export const edgeScenarioArbitrary: fc.Arbitrary<BusinessScenario> =
  businessScenarioArbitrary.map((scenario) => ({
    ...scenario,
    type: 'edge' as const,
    edgeCases: {
      boundaries: true,
      nullish: true,
      empty: true,
      maxSize: fc.sample(fc.boolean(), 1)[0] ?? true,
      unicode: fc.sample(fc.boolean(), 1)[0] ?? true,
    },
  }));

export const peakScenarioArbitrary: fc.Arbitrary<BusinessScenario> =
  businessScenarioArbitrary.map((scenario) => ({
    ...scenario,
    type: 'peak' as const,
    loadParameters: {
      ...scenario.loadParameters,
      users: Math.max(scenario.loadParameters.users, 1000),
      requestsPerSecond: Math.max(
        scenario.loadParameters.requestsPerSecond,
        100
      ),
    },
  }));

export const errorScenarioArbitrary: fc.Arbitrary<BusinessScenario> =
  businessScenarioArbitrary.map((scenario) => ({
    ...scenario,
    type: 'error' as const,
    errorConfig: {
      ...scenario.errorConfig,
      rate: Math.max(scenario.errorConfig.rate, 5.0), // Higher error rate
      retryable: true,
      maxRetries: Math.max(scenario.errorConfig.maxRetries, 2),
    },
    distribution: {
      normal: 0.3,
      edge: 0.2,
      error: 0.5, // Higher error scenario weight
    },
  }));

/**
 * Utility to validate scenario distribution sums to 1
 */
export const isValidDistribution = (
  distribution: ScenarioDistribution
): boolean => {
  const sum = distribution.normal + distribution.edge + distribution.error;
  return Math.abs(sum - 1) < 0.001;
};

/**
 * Utility to validate load parameters consistency
 */
export const isValidLoadParameters = (params: LoadParameters): boolean => {
  return (
    params.users > 0 &&
    params.requestsPerSecond > 0 &&
    params.duration > 0 &&
    params.rampUp >= 0 &&
    params.rampDown >= 0 &&
    params.rampUp + params.rampDown < params.duration
  );
};
