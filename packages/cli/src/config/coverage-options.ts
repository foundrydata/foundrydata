import type {
  CoverageDimension,
  CoveragePlannerUserOptions,
} from '@foundrydata/core';
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
}

export interface ResolvedCliCoverage {
  coverage: CliCoverageConfig;
  /**
   * Optional message describing ignored coverage options when coverage=off.
   */
  ignoredReason?: string;
}

const KNOWN_DIMENSIONS: CoverageDimension[] = [
  'structure',
  'branches',
  'enum',
  'boundaries',
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

function resolvePlannerFromProfile(
  profile: 'quick' | 'balanced' | 'thorough'
): CoveragePlannerUserOptions | undefined {
  switch (profile) {
    case 'quick':
      return {
        caps: {
          maxTargetsPerDimension: {
            branches: 128,
            enum: 128,
          },
          maxTargetsPerSchema: 64,
          maxTargetsPerOperation: 32,
        },
      };
    case 'balanced':
      return {
        caps: {
          maxTargetsPerDimension: {
            branches: 512,
            enum: 512,
          },
          maxTargetsPerSchema: 256,
          maxTargetsPerOperation: 128,
        },
      };
    case 'thorough':
      return {};
    default:
      return undefined;
  }
}

export function resolveCliCoverageOptions(
  cliOptions: CliOptions
): ResolvedCliCoverage {
  const mode = parseCoverageMode(cliOptions.coverage);
  const dimensionsEnabled = parseDimensions(cliOptions.coverageDimensions);
  const excludeUnreachable = parseExcludeUnreachable(
    cliOptions.coverageExcludeUnreachable
  );
  const minCoverage = parseMinCoverage(cliOptions.coverageMin);
  const profile = parseProfile(cliOptions.coverageProfile);
  const reportPath =
    typeof cliOptions.coverageReport === 'string'
      ? cliOptions.coverageReport
      : undefined;

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

  return {
    coverage: {
      mode,
      dimensionsEnabled,
      excludeUnreachable,
      minCoverage: mode === 'off' ? undefined : minCoverage,
      reportPath: mode === 'off' ? undefined : reportPath,
      profile,
      planner,
    },
    ignoredReason,
  };
}
