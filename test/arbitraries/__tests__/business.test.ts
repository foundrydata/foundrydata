/**
 * ================================================================================
 * BUSINESS SCENARIO ARBITRARIES TESTS - FOUNDRYDATA TESTING v2.1
 *
 * Property-based tests verifying that generated business scenarios have consistent
 * configurations and valid distributions. Deterministic testing using fixed seed.
 * ================================================================================
 */

import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { propertyTest } from '../../setup.js';
import {
  businessScenarioArbitrary,
  normalScenarioArbitrary,
  edgeScenarioArbitrary,
  peakScenarioArbitrary,
  errorScenarioArbitrary,
  createDistributionRatios,
  errorConfigArbitrary,
  loadParametersArbitrary,
  edgeCaseFlagsArbitrary,
  businessScenarioMetadataArbitrary,
  isValidDistribution,
  isValidLoadParameters,
  type BusinessScenario,
  type LoadParameters,
  type ErrorConfig,
  type EdgeCaseFlags,
  type BusinessScenarioMetadata,
} from '../business.js';

// Fixed seed for deterministic testing as per testing guide
const FC_SEED = 424242;

describe('Business Scenario Arbitraries', () => {
  describe('createDistributionRatios helper', () => {
    test('always generates distributions that sum to 1', () => {
      return propertyTest(
        'distribution sums to 1',
        fc.property(createDistributionRatios(), (distribution) => {
          const sum =
            distribution.normal + distribution.edge + distribution.error;
          expect(Math.abs(sum - 1)).toBeLessThan(0.001);
          expect(isValidDistribution(distribution)).toBe(true);
        }),
        { parameters: { seed: FC_SEED, numRuns: 100 } }
      );
    });

    test('generates positive ratios within valid ranges', () => {
      return propertyTest(
        'distribution ratios valid',
        fc.property(createDistributionRatios(), (distribution) => {
          expect(distribution.normal).toBeGreaterThan(0);
          expect(distribution.edge).toBeGreaterThan(0);
          expect(distribution.error).toBeGreaterThan(0);
          expect(distribution.normal).toBeLessThanOrEqual(1);
          expect(distribution.edge).toBeLessThanOrEqual(1);
          expect(distribution.error).toBeLessThanOrEqual(1);
        }),
        { parameters: { seed: FC_SEED, numRuns: 50 } }
      );
    });
  });

  describe('errorConfigArbitrary', () => {
    test('generates valid error configurations', () => {
      return propertyTest(
        'errorConfigArbitrary valid',
        fc.property(errorConfigArbitrary, (config: ErrorConfig) => {
          // Rate should be within bounds
          expect(config.rate).toBeGreaterThanOrEqual(0.1);
          expect(config.rate).toBeLessThanOrEqual(25.0);

          // Types should be non-empty array
          expect(Array.isArray(config.types)).toBe(true);
          expect(config.types.length).toBeGreaterThanOrEqual(1);
          expect(config.types.length).toBeLessThanOrEqual(4);

          // All types should be valid error types
          const validTypes = [
            'network_timeout',
            'connection_refused',
            'service_unavailable',
            'rate_limit_exceeded',
            'validation_error',
            'authentication_failed',
            'authorization_denied',
            'internal_server_error',
          ];
          config.types.forEach((type) => {
            expect(validTypes).toContain(type);
          });

          // Retryable should be boolean
          expect(typeof config.retryable).toBe('boolean');

          // MaxRetries should be within bounds
          expect(config.maxRetries).toBeGreaterThanOrEqual(0);
          expect(config.maxRetries).toBeLessThanOrEqual(5);
        }),
        { parameters: { seed: FC_SEED, numRuns: 50 } }
      );
    });
  });

  describe('loadParametersArbitrary', () => {
    test('generates valid load parameters', () => {
      return propertyTest(
        'loadParametersArbitrary valid',
        fc.property(loadParametersArbitrary, (params: LoadParameters) => {
          expect(params.users).toBeGreaterThanOrEqual(1);
          expect(params.users).toBeLessThanOrEqual(10000);

          expect(params.requestsPerSecond).toBeGreaterThanOrEqual(1);
          expect(params.requestsPerSecond).toBeLessThanOrEqual(1000);

          expect(params.duration).toBeGreaterThanOrEqual(10);
          expect(params.duration).toBeLessThanOrEqual(3600);

          expect(params.rampUp).toBeGreaterThanOrEqual(0);
          expect(params.rampUp).toBeLessThanOrEqual(300);

          expect(params.rampDown).toBeGreaterThanOrEqual(0);
          expect(params.rampDown).toBeLessThanOrEqual(300);
        }),
        { parameters: { seed: FC_SEED, numRuns: 50 } }
      );
    });

    test('validates load parameters consistency', () => {
      return propertyTest(
        'load parameters consistency',
        fc.property(loadParametersArbitrary, (params: LoadParameters) => {
          // Basic validation should pass for generated parameters
          expect(params.users > 0).toBe(true);
          expect(params.requestsPerSecond > 0).toBe(true);
          expect(params.duration > 0).toBe(true);
          expect(params.rampUp >= 0).toBe(true);
          expect(params.rampDown >= 0).toBe(true);

          // Note: We don't enforce rampUp + rampDown < duration in the arbitrary
          // but the validator function checks this for business logic validation
          if (params.rampUp + params.rampDown < params.duration) {
            expect(isValidLoadParameters(params)).toBe(true);
          }
        }),
        { parameters: { seed: FC_SEED, numRuns: 50 } }
      );
    });
  });

  describe('edgeCaseFlagsArbitrary', () => {
    test('generates valid edge case flags', () => {
      return propertyTest(
        'edgeCaseFlagsArbitrary valid',
        fc.property(edgeCaseFlagsArbitrary, (flags: EdgeCaseFlags) => {
          expect(typeof flags.boundaries).toBe('boolean');
          expect(typeof flags.nullish).toBe('boolean');
          expect(typeof flags.empty).toBe('boolean');
          expect(typeof flags.maxSize).toBe('boolean');
          expect(typeof flags.unicode).toBe('boolean');
        }),
        { parameters: { seed: FC_SEED, numRuns: 30 } }
      );
    });
  });

  describe('businessScenarioMetadataArbitrary', () => {
    test('generates valid metadata', () => {
      return propertyTest(
        'businessScenarioMetadataArbitrary valid',
        fc.property(
          businessScenarioMetadataArbitrary,
          (metadata: BusinessScenarioMetadata) => {
            // Name validation
            expect(metadata.name.length).toBeGreaterThanOrEqual(5);
            expect(metadata.name.length).toBeLessThanOrEqual(50);

            // Description validation
            expect(metadata.description.length).toBeGreaterThanOrEqual(10);
            expect(metadata.description.length).toBeLessThanOrEqual(200);

            // Tags validation
            expect(Array.isArray(metadata.tags)).toBe(true);
            expect(metadata.tags.length).toBeGreaterThanOrEqual(1);
            expect(metadata.tags.length).toBeLessThanOrEqual(3);

            const validTags = [
              'load_test',
              'stress_test',
              'integration_test',
              'performance_test',
              'regression_test',
              'smoke_test',
              'api_test',
              'database_test',
            ];
            metadata.tags.forEach((tag) => {
              expect(validTags).toContain(tag);
            });

            // Version validation (semantic versioning pattern)
            expect(typeof metadata.version).toBe('string');
            expect(/^\d+\.\d+\.\d+$/.test(metadata.version)).toBe(true);
          }
        ),
        { parameters: { seed: FC_SEED, numRuns: 50 } }
      );
    });
  });

  describe('businessScenarioArbitrary', () => {
    test('generates complete valid business scenarios', () => {
      return propertyTest(
        'businessScenarioArbitrary valid',
        fc.property(businessScenarioArbitrary, (scenario: BusinessScenario) => {
          // Type validation
          const validTypes = ['normal', 'edge', 'peak', 'error'];
          expect(validTypes).toContain(scenario.type);

          // Distribution validation
          expect(isValidDistribution(scenario.distribution)).toBe(true);

          // Seed validation
          expect(scenario.seed).toBeGreaterThanOrEqual(100000);
          expect(scenario.seed).toBeLessThanOrEqual(999999);

          // All sub-components should be valid
          expect(typeof scenario.loadParameters).toBe('object');
          expect(typeof scenario.errorConfig).toBe('object');
          expect(typeof scenario.edgeCases).toBe('object');
          expect(typeof scenario.metadata).toBe('object');
        }),
        { parameters: { seed: FC_SEED, numRuns: 100 } }
      );
    });
  });

  describe('Scenario-specific arbitraries', () => {
    test('normalScenarioArbitrary enforces normal scenario constraints', () => {
      return propertyTest(
        'normalScenarioArbitrary constraints',
        fc.property(normalScenarioArbitrary, (scenario) => {
          expect(scenario.type).toBe('normal');

          // Normal scenarios should have limited load
          expect(scenario.loadParameters.users).toBeLessThanOrEqual(100);
          expect(scenario.loadParameters.requestsPerSecond).toBeLessThanOrEqual(
            50
          );

          // Low error rate for normal scenarios
          expect(scenario.errorConfig.rate).toBeLessThanOrEqual(1.0);
        }),
        { parameters: { seed: FC_SEED, numRuns: 30 } }
      );
    });

    test('edgeScenarioArbitrary enforces edge case flags', () => {
      return propertyTest(
        'edgeScenarioArbitrary flags',
        fc.property(edgeScenarioArbitrary, (scenario) => {
          expect(scenario.type).toBe('edge');

          // Edge scenarios must enable core edge case testing
          expect(scenario.edgeCases.boundaries).toBe(true);
          expect(scenario.edgeCases.nullish).toBe(true);
          expect(scenario.edgeCases.empty).toBe(true);
        }),
        { parameters: { seed: FC_SEED, numRuns: 30 } }
      );
    });

    test('peakScenarioArbitrary enforces high load constraints', () => {
      return propertyTest(
        'peakScenarioArbitrary high load',
        fc.property(peakScenarioArbitrary, (scenario) => {
          expect(scenario.type).toBe('peak');

          // Peak scenarios should have high load
          expect(scenario.loadParameters.users).toBeGreaterThanOrEqual(1000);
          expect(
            scenario.loadParameters.requestsPerSecond
          ).toBeGreaterThanOrEqual(100);
        }),
        { parameters: { seed: FC_SEED, numRuns: 30 } }
      );
    });

    test('errorScenarioArbitrary enforces error-focused configuration', () => {
      return propertyTest(
        'errorScenarioArbitrary config',
        fc.property(errorScenarioArbitrary, (scenario) => {
          expect(scenario.type).toBe('error');

          // Error scenarios should have higher error rates
          expect(scenario.errorConfig.rate).toBeGreaterThanOrEqual(5.0);
          expect(scenario.errorConfig.retryable).toBe(true);
          expect(scenario.errorConfig.maxRetries).toBeGreaterThanOrEqual(2);

          // Error-focused distribution
          expect(scenario.distribution.error).toBe(0.5);
          expect(scenario.distribution.normal).toBe(0.3);
          expect(scenario.distribution.edge).toBe(0.2);
        }),
        { parameters: { seed: FC_SEED, numRuns: 30 } }
      );
    });
  });

  describe('Validation utilities', () => {
    test('isValidDistribution correctly validates distributions', () => {
      // Valid distributions
      expect(isValidDistribution({ normal: 0.5, edge: 0.3, error: 0.2 })).toBe(
        true
      );
      expect(
        isValidDistribution({ normal: 0.333, edge: 0.333, error: 0.334 })
      ).toBe(true);

      // Invalid distributions
      expect(isValidDistribution({ normal: 0.6, edge: 0.3, error: 0.2 })).toBe(
        false
      );
      expect(isValidDistribution({ normal: 0.4, edge: 0.4, error: 0.4 })).toBe(
        false
      );
      expect(isValidDistribution({ normal: 0.1, edge: 0.1, error: 0.1 })).toBe(
        false
      );
    });

    test('isValidLoadParameters correctly validates load parameters', () => {
      // Valid parameters
      expect(
        isValidLoadParameters({
          users: 100,
          requestsPerSecond: 10,
          duration: 60,
          rampUp: 10,
          rampDown: 10,
        })
      ).toBe(true);

      // Invalid parameters - negative values
      expect(
        isValidLoadParameters({
          users: -1,
          requestsPerSecond: 10,
          duration: 60,
          rampUp: 10,
          rampDown: 10,
        })
      ).toBe(false);

      // Invalid parameters - ramp times exceed duration
      expect(
        isValidLoadParameters({
          users: 100,
          requestsPerSecond: 10,
          duration: 60,
          rampUp: 40,
          rampDown: 40,
        })
      ).toBe(false);
    });
  });

  describe('Seed generation and determinism', () => {
    test('generated seeds are within expected range', () => {
      return propertyTest(
        'seeds within range',
        fc.property(businessScenarioArbitrary, (scenario) => {
          expect(scenario.seed).toBeGreaterThanOrEqual(100000);
          expect(scenario.seed).toBeLessThanOrEqual(999999);
          expect(Number.isInteger(scenario.seed)).toBe(true);
        }),
        { parameters: { seed: FC_SEED, numRuns: 50 } }
      );
    });

    test('same arbitrary with same seed produces same values', () => {
      const seed1 = 123456;
      const seed2 = 123456;

      const scenario1 = fc.sample(businessScenarioArbitrary, {
        seed: seed1,
        numRuns: 1,
      })[0];
      const scenario2 = fc.sample(businessScenarioArbitrary, {
        seed: seed2,
        numRuns: 1,
      })[0];

      expect(scenario1).toEqual(scenario2);
    });

    test('different seeds produce different values', () => {
      const seed1 = 123456;
      const seed2 = 654321;

      const scenario1 = fc.sample(businessScenarioArbitrary, {
        seed: seed1,
        numRuns: 1,
      })[0];
      const scenario2 = fc.sample(businessScenarioArbitrary, {
        seed: seed2,
        numRuns: 1,
      })[0];

      expect(scenario1).not.toEqual(scenario2);
    });
  });

  describe('Distribution sum validation across all arbitraries', () => {
    test('all scenario arbitraries maintain valid distributions', async () => {
      const scenarios = [
        businessScenarioArbitrary,
        normalScenarioArbitrary,
        edgeScenarioArbitrary,
        peakScenarioArbitrary,
        errorScenarioArbitrary,
      ];

      for (let index = 0; index < scenarios.length; index++) {
        const arbitrary = scenarios[index]!; // noUncheckedIndexedAccess: guaranteed by loop bounds
        await propertyTest(
          `scenario distribution ${index}`,
          fc.property(arbitrary, (scenario) => {
            expect(isValidDistribution(scenario.distribution)).toBe(true);
            const sum =
              scenario.distribution.normal +
              scenario.distribution.edge +
              scenario.distribution.error;
            expect(Math.abs(sum - 1)).toBeLessThan(0.001);
          }),
          { parameters: { seed: FC_SEED + index, numRuns: 20 } }
        );
      }
    });
  });
});
