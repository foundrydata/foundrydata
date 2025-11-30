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

  it('applies balanced profile presets in guided mode', () => {
    const { coverage, recommendedMaxInstances } = resolveCliCoverageOptions({
      coverage: 'guided',
      coverageProfile: 'balanced',
    } as CliOptions);

    expect(coverage.dimensionsEnabled).toEqual([
      'structure',
      'branches',
      'enum',
    ]);
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

  it('applies thorough profile presets in guided mode', () => {
    const { coverage, recommendedMaxInstances } = resolveCliCoverageOptions({
      coverage: 'guided',
      coverageProfile: 'thorough',
    } as CliOptions);

    expect(coverage.dimensionsEnabled).toEqual([
      'structure',
      'branches',
      'enum',
      'boundaries',
      'operations',
    ]);
    expect(coverage.planner?.dimensionPriority).toEqual([
      'branches',
      'enum',
      'structure',
      'boundaries',
    ]);
    expect(coverage.planner?.caps).toBeUndefined();
    expect(recommendedMaxInstances).toBe(1000);
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
      'operations',
    ]);
    expect(recommendedMaxInstances).toBeUndefined();
  });

  it('disables coverage options when coverage=off', () => {
    const { coverage, ignoredReason, recommendedMaxInstances } =
      resolveCliCoverageOptions({
        coverage: 'off',
        coverageProfile: 'quick',
        coverageDimensions: 'structure,branches',
        coverageMin: 0.8,
        coverageReport: 'coverage.json',
        coverageReportMode: 'summary',
      } as CliOptions);

    expect(coverage.mode).toBe('off');
    // Dimensions remain a projection, but coverage artifacts are gated off.
    expect(coverage.dimensionsEnabled).toEqual(['structure', 'branches']);
    expect(coverage.minCoverage).toBeUndefined();
    expect(coverage.reportPath).toBeUndefined();
    expect(coverage.reportMode).toBeUndefined();
    expect(ignoredReason).toContain('ignored');
    expect(recommendedMaxInstances).toBeUndefined();
  });

  it('keeps report options when coverage is enabled', () => {
    const { coverage, ignoredReason } = resolveCliCoverageOptions({
      coverage: 'measure',
      coverageDimensions: 'structure,branches,enum',
      coverageMin: 0.5,
      coverageReport: 'out.json',
      coverageReportMode: 'summary',
    } as CliOptions);

    expect(coverage.mode).toBe('measure');
    expect(coverage.dimensionsEnabled).toEqual([
      'structure',
      'branches',
      'enum',
    ]);
    expect(coverage.minCoverage).toBe(0.5);
    expect(coverage.reportPath).toBe('out.json');
    expect(coverage.reportMode).toBe('summary');
    expect(ignoredReason).toBeUndefined();
  });

  it('parses excludeUnreachable with default true and explicit false', () => {
    const { coverage: defaultCoverage } = resolveCliCoverageOptions({
      coverage: 'measure',
    } as CliOptions);
    expect(defaultCoverage.excludeUnreachable).toBe(true);

    const { coverage: explicitFalse } = resolveCliCoverageOptions({
      coverage: 'measure',
      coverageExcludeUnreachable: 'false',
    } as CliOptions);
    expect(explicitFalse.excludeUnreachable).toBe(false);
  });

  it('throws for invalid coverage flags with clear messages', () => {
    expect(() =>
      resolveCliCoverageOptions({
        coverage: 'invalid-mode',
      } as CliOptions)
    ).toThrow(/Invalid --coverage value/);

    expect(() =>
      resolveCliCoverageOptions({
        coverage: 'measure',
        coverageProfile: 'fast-and-loose',
      } as CliOptions)
    ).toThrow(/Invalid --coverage-profile value/);

    expect(() =>
      resolveCliCoverageOptions({
        coverage: 'measure',
        coverageDimensions: 'structure,unknown-dimension',
      } as CliOptions)
    ).toThrow(/Unknown coverage dimensions/);

    expect(() =>
      resolveCliCoverageOptions({
        coverage: 'measure',
        coverageExcludeUnreachable: 'maybe',
      } as CliOptions)
    ).toThrow(/Invalid --coverage-exclude-unreachable value/);

    expect(() =>
      resolveCliCoverageOptions({
        coverage: 'measure',
        coverageMin: 2,
      } as CliOptions)
    ).toThrow(/Invalid --coverage-min value/);

    expect(() =>
      resolveCliCoverageOptions({
        coverage: 'measure',
        coverageReportMode: 'compact',
      } as CliOptions)
    ).toThrow(/Invalid --coverage-report-mode value/);
  });
});
