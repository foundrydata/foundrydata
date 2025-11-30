import {
  DEFAULT_PLANNER_DIMENSIONS_ENABLED,
  type CoverageDimension,
  type CoveragePlannerUserOptions,
} from '@foundrydata/core';
import {
  COVERAGE_REPORT_MODES,
  type CoverageReportMode,
} from '@foundrydata/shared';
import type { CliOptions } from '../flags';

type CoverageMode = 'off' | 'measure' | 'guided';

export interface CliCoverageConfig {
  mode: CoverageMode;
  dimensionsEnabled: CoverageDimension[];
  excludeUnreachable: boolean;
  minCoverage?: number;
  reportPath?: string;
  profile?: 'quick' | 'balanced' | 'thorough';
  planner?: CoveragePlannerUserOptions;
  reportMode?: CoverageReportMode;
}

export interface ResolvedCliCoverage {
  coverage: CliCoverageConfig;
  /**
   * Optional message describing ignored coverage options when coverage=off.
   */
  ignoredReason?: string;
  recommendedMaxInstances?: number;
}

interface CoverageProfilePreset {
  dimensions: CoverageDimension[];
  recommendedMaxInstances: number;
  planner?: CoveragePlannerUserOptions;
}

const COVERAGE_PROFILE_PRESETS: Record<
  'quick' | 'balanced' | 'thorough',
  CoverageProfilePreset
> = {
  quick: {
    dimensions: ['structure', 'branches'],
    recommendedMaxInstances: 75,
    planner: {
      dimensionPriority: ['branches', 'structure', 'enum', 'boundaries'],
      caps: {
        maxTargetsPerDimension: {
          branches: 128,
          enum: 128,
        },
        maxTargetsPerSchema: 64,
        maxTargetsPerOperation: 32,
      },
    },
  },
  balanced: {
    dimensions: ['structure', 'branches', 'enum'],
    recommendedMaxInstances: 350,
    planner: {
      dimensionPriority: ['branches', 'enum', 'structure'],
      caps: {
        maxTargetsPerDimension: {
          branches: 512,
          enum: 512,
        },
        maxTargetsPerSchema: 256,
        maxTargetsPerOperation: 128,
      },
    },
  },
  thorough: {
    dimensions: ['structure', 'branches', 'enum', 'boundaries', 'operations'],
    recommendedMaxInstances: 1000,
    planner: {
      dimensionPriority: ['branches', 'enum', 'structure', 'boundaries'],
    },
  },
};

const KNOWN_DIMENSIONS: CoverageDimension[] = [
  'structure',
  'branches',
  'enum',
  'boundaries',
  'operations',
];

function parseCoverageMode(raw: unknown): CoverageMode {
  if (raw === undefined || raw === null) return 'off';
  const value = String(raw).toLowerCase();
  if (value === 'off' || value === 'measure' || value === 'guided') {
    return value;
  }
  throw new Error(
    `Invalid --coverage value "${String(
      raw
    )}". Expected one of: off, measure, guided.`
  );
}

function parseDimensions(raw: unknown): CoverageDimension[] {
  if (raw === undefined || raw === null || raw === '') {
    return [];
  }
  const parts = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return [];

  const unknown: string[] = [];
  const dims: CoverageDimension[] = [];

  for (const part of parts) {
    const lower = part.toLowerCase();
    const match = KNOWN_DIMENSIONS.find((d) => d === lower);
    if (match) {
      if (!dims.includes(match)) dims.push(match);
    } else {
      unknown.push(part);
    }
  }

  if (unknown.length > 0) {
    throw new Error(
      `Unknown coverage dimensions: ${unknown.join(
        ', '
      )}. Supported dimensions are: ${KNOWN_DIMENSIONS.join(', ')}.`
    );
  }

  return dims;
}

function parseExcludeUnreachable(raw: unknown): boolean {
  if (raw === undefined || raw === null) {
    // Recommended default for CLI/CI in spec: true
    return true;
  }
  if (typeof raw === 'boolean') return raw;
  const value = String(raw).toLowerCase();
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(
    `Invalid --coverage-exclude-unreachable value "${String(
      raw
    )}". Expected true or false.`
  );
}

function parseMinCoverage(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const num =
    typeof raw === 'number' && Number.isFinite(raw)
      ? raw
      : Number.parseFloat(String(raw));
  if (!Number.isFinite(num) || num < 0 || num > 1) {
    throw new Error(
      `Invalid --coverage-min value "${String(
        raw
      )}". Expected a number between 0 and 1.`
    );
  }
  return num;
}

function parseProfile(
  raw: unknown
): 'quick' | 'balanced' | 'thorough' | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const value = String(raw).toLowerCase();
  if (value === 'quick' || value === 'balanced' || value === 'thorough') {
    return value;
  }
  throw new Error(
    `Invalid --coverage-profile value "${String(
      raw
    )}". Expected one of: quick, balanced, thorough.`
  );
}

function parseCoverageReportMode(raw: unknown): CoverageReportMode {
  if (raw === undefined || raw === null || raw === '') {
    return 'full';
  }
  const value = String(raw).toLowerCase();
  if (COVERAGE_REPORT_MODES.includes(value as CoverageReportMode)) {
    return value as CoverageReportMode;
  }
  throw new Error(
    `Invalid --coverage-report-mode value "${String(
      raw
    )}". Expected one of: ${COVERAGE_REPORT_MODES.join(', ')}.`
  );
}

function resolvePlannerFromProfile(
  profile: 'quick' | 'balanced' | 'thorough'
): CoveragePlannerUserOptions | undefined {
  return COVERAGE_PROFILE_PRESETS[profile]?.planner;
}

function resolveDimensionsEnabled(
  mode: CoverageMode,
  parsedDimensions: CoverageDimension[],
  preset?: CoverageProfilePreset
): CoverageDimension[] {
  if (parsedDimensions.length > 0) {
    return parsedDimensions;
  }
  if (mode === 'off') {
    return [];
  }
  return preset?.dimensions ?? [...DEFAULT_PLANNER_DIMENSIONS_ENABLED];
}

// eslint-disable-next-line complexity
export function resolveCliCoverageOptions(
  cliOptions: CliOptions
): ResolvedCliCoverage {
  const mode = parseCoverageMode(cliOptions.coverage);
  const parsedDimensions = parseDimensions(cliOptions.coverageDimensions);
  const excludeUnreachable = parseExcludeUnreachable(
    cliOptions.coverageExcludeUnreachable
  );
  const minCoverage = parseMinCoverage(cliOptions.coverageMin);
  const profile = parseProfile(cliOptions.coverageProfile);
  const reportPath =
    typeof cliOptions.coverageReport === 'string'
      ? cliOptions.coverageReport
      : undefined;
  const reportMode = parseCoverageReportMode(cliOptions.coverageReportMode);

  const preset = profile ? COVERAGE_PROFILE_PRESETS[profile] : undefined;
  const dimensionsEnabled = resolveDimensionsEnabled(
    mode,
    parsedDimensions,
    preset
  );

  let ignoredReason: string | undefined;
  if (mode === 'off') {
    if (minCoverage !== undefined || reportPath) {
      ignoredReason =
        'Coverage options coverage-min/coverage-report are ignored when coverage=off.';
    }
  }

  const planner =
    mode === 'guided' && profile
      ? resolvePlannerFromProfile(profile)
      : undefined;
  const recommendedMaxInstances =
    mode === 'guided' ? preset?.recommendedMaxInstances : undefined;

  return {
    coverage: {
      mode,
      dimensionsEnabled,
      excludeUnreachable,
      minCoverage: mode === 'off' ? undefined : minCoverage,
      reportPath: mode === 'off' ? undefined : reportPath,
      profile,
      planner,
      reportMode: mode === 'off' ? undefined : reportMode,
    },
    ignoredReason,
    recommendedMaxInstances,
  };
}
