import { describe, expect, it } from 'vitest';
import type { CliOptions } from '../../flags';
import { resolveCliCoverageOptions } from '../coverage-options.js';

describe('resolveCliCoverageOptions', () => {
  it('applies quick profile presets in guided mode', () => {
    const { coverage, recommendedMaxInstances } = resolveCliCoverageOptions({
      coverage: 'guided',
      coverageProfile: 'quick',
    } as CliOptions);

    expect(coverage.dimensionsEnabled).toEqual(['structure', 'branches']);
    expect(coverage.planner?.caps).toEqual({
      maxTargetsPerDimension: {
        branches: 128,
        enum: 128,
      },
      maxTargetsPerSchema: 64,
      maxTargetsPerOperation: 32,
    });
    expect(coverage.planner?.dimensionPriority).toEqual([
      'branches',
      'structure',
      'enum',
      'boundaries',
    ]);
    expect(recommendedMaxInstances).toBe(75);
  });

  it('lets explicit dimensions override the profile defaults', () => {
    const { coverage, recommendedMaxInstances } = resolveCliCoverageOptions({
      coverage: 'guided',
      coverageProfile: 'balanced',
      coverageDimensions: 'structure,enum',
    } as CliOptions);

    expect(coverage.dimensionsEnabled).toEqual(['structure', 'enum']);
    expect(coverage.planner?.caps).toEqual({
      maxTargetsPerDimension: {
        branches: 512,
        enum: 512,
      },
      maxTargetsPerSchema: 256,
      maxTargetsPerOperation: 128,
    });
    expect(coverage.planner?.dimensionPriority).toEqual([
      'branches',
      'enum',
      'structure',
    ]);
    expect(recommendedMaxInstances).toBe(350);
  });

  it('does not recommend maxInstances for non-guided modes', () => {
    const { coverage, recommendedMaxInstances } = resolveCliCoverageOptions({
      coverage: 'measure',
      coverageProfile: 'thorough',
    } as CliOptions);

    expect(coverage.dimensionsEnabled).toEqual([
      'structure',
      'branches',
      'enum',
      'boundaries',
    ]);
    expect(recommendedMaxInstances).toBeUndefined();
  });
});
