/* eslint-disable max-lines */
import type { CoverageDimension, CoverageTarget } from '@foundrydata/shared';
import type { CoverageGraph } from './index.js';
import { XorShift32, normalizeSeed } from '../util/rng.js';

export type CoverageHintKind =
  | 'preferBranch'
  | 'ensurePropertyPresence'
  | 'coverEnumValue';

export interface CoverageHintBase {
  /**
   * Canonical JSON Pointer for the schema node targeted by the hint.
   */
  canonPath: string;
}

export interface PreferBranchHint extends CoverageHintBase {
  kind: 'preferBranch';
  params: {
    branchIndex: number;
  };
}

export interface EnsurePropertyPresenceHint extends CoverageHintBase {
  kind: 'ensurePropertyPresence';
  params: {
    propertyName: string;
    present: boolean;
  };
}

export interface CoverEnumValueHint extends CoverageHintBase {
  kind: 'coverEnumValue';
  params: {
    valueIndex: number;
  };
}

export type CoverageHint =
  | PreferBranchHint
  | EnsurePropertyPresenceHint
  | CoverEnumValueHint;

export interface TestUnitScope {
  /**
   * Operation key when an OpenAPI context is present.
   */
  operationKey?: string;
  /**
   * Optional list of schema paths associated with this unit.
   */
  schemaPaths?: string[];
}

export interface TestUnit {
  /**
   * Stable identifier for the TestUnit within a single run.
   */
  id: string;
  /**
   * Seed used to derive per-instance randomness for this unit.
   */
  seed: number;
  /**
   * Planned number of instances for this unit (upper bound).
   */
  count: number;
  /**
   * Hints attached to this unit for guided coverage.
   */
  hints: CoverageHint[];
  /**
   * Optional scope metadata to help diagnostics and reporting.
   */
  scope?: TestUnitScope;
}

export interface CoveragePlannerCapsConfig {
  /**
   * Maximum targets per dimension; omitted dimensions use defaults.
   */
  maxTargetsPerDimension?: Partial<Record<CoverageDimension | string, number>>;
  /**
   * Maximum targets per schema node before capping.
   */
  maxTargetsPerSchema?: number;
  /**
   * Maximum targets per operation before capping.
   */
  maxTargetsPerOperation?: number;
}

export interface CoveragePlannerUserOptions {
  /**
   * Enabled coverage dimensions for this planner run.
   */
  dimensionsEnabled?: CoverageDimension[];
  /**
   * Explicit dimension priority override; when omitted, a default
   * order favoring branches and enums is used.
   */
  dimensionPriority?: CoverageDimension[];
  /**
   * Optional soft time cap for planner work, in milliseconds.
   */
  softTimeMs?: number;
  /**
   * Optional caps configuration for large target sets.
   */
  caps?: CoveragePlannerCapsConfig;
}

export interface CoveragePlannerConfig {
  budget: {
    maxInstances: number;
    softTimeMs?: number;
  };
  dimensionsEnabled: CoverageDimension[];
  dimensionPriority: CoverageDimension[];
  caps?: CoveragePlannerCapsConfig;
}

export interface CoveragePlannerInput {
  graph: CoverageGraph;
  targets: CoverageTarget[];
  config: CoveragePlannerConfig;
}

interface SortableTarget {
  target: CoverageTarget;
  operationKey: string;
  dimensionIndex: number;
  weight: number;
}

export const DEFAULT_PLANNER_DIMENSIONS_ENABLED: readonly CoverageDimension[] =
  ['structure', 'branches', 'enum'] as const;

export const DEFAULT_PLANNER_DIMENSION_ORDER: readonly CoverageDimension[] = [
  'branches',
  'enum',
  'structure',
  'boundaries',
] as const;

function normalizeDimensions(
  userDimensions?: CoverageDimension[]
): CoverageDimension[] {
  if (!userDimensions || userDimensions.length === 0) {
    return [...DEFAULT_PLANNER_DIMENSIONS_ENABLED];
  }
  const seen = new Set<string>();
  const result: CoverageDimension[] = [];
  for (const dim of userDimensions) {
    if (!dim) continue;
    if (!seen.has(dim)) {
      seen.add(dim);
      result.push(dim);
    }
  }
  return result.length > 0 ? result : [...DEFAULT_PLANNER_DIMENSIONS_ENABLED];
}

function normalizePriorityOrder(
  enabledDimensions: CoverageDimension[],
  userPriority?: CoverageDimension[]
): CoverageDimension[] {
  const baseOrder =
    userPriority && userPriority.length > 0
      ? userPriority
      : (DEFAULT_PLANNER_DIMENSION_ORDER as CoverageDimension[]);

  const enabledSet = new Set(enabledDimensions);
  const result: CoverageDimension[] = [];

  for (const dim of baseOrder) {
    if (enabledSet.has(dim) && !result.includes(dim)) {
      result.push(dim);
    }
  }

  for (const dim of enabledDimensions) {
    if (!result.includes(dim)) {
      result.push(dim);
    }
  }

  return result;
}

export interface ResolvePlannerConfigOptions
  extends CoveragePlannerUserOptions {
  maxInstances: number;
}

export function resolveCoveragePlannerConfig(
  options: ResolvePlannerConfigOptions
): CoveragePlannerConfig {
  const {
    maxInstances,
    softTimeMs,
    dimensionsEnabled,
    dimensionPriority,
    caps,
  } = options;

  if (!Number.isFinite(maxInstances) || maxInstances <= 0) {
    throw new Error('maxInstances must be a positive finite number');
  }

  if (
    softTimeMs !== undefined &&
    (!Number.isFinite(softTimeMs) || softTimeMs <= 0)
  ) {
    throw new Error('softTimeMs must be a positive finite number when set');
  }

  const enabled = normalizeDimensions(dimensionsEnabled);
  const priority = normalizePriorityOrder(enabled, dimensionPriority);

  return {
    budget: {
      maxInstances,
      softTimeMs,
    },
    dimensionsEnabled: enabled,
    dimensionPriority: priority,
    caps,
  };
}

// eslint-disable-next-line complexity
export function isCoverageHint(value: unknown): value is CoverageHint {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as {
    kind?: unknown;
    canonPath?: unknown;
    params?: unknown;
  };
  if (
    typeof candidate.canonPath !== 'string' ||
    candidate.canonPath.length === 0
  ) {
    return false;
  }
  switch (candidate.kind) {
    case 'preferBranch': {
      const params = candidate.params as { branchIndex?: unknown } | undefined;
      return (
        !!params &&
        typeof params.branchIndex === 'number' &&
        Number.isInteger(params.branchIndex)
      );
    }
    case 'ensurePropertyPresence': {
      const params = candidate.params as
        | { propertyName?: unknown; present?: unknown }
        | undefined;
      return (
        !!params &&
        typeof params.propertyName === 'string' &&
        typeof params.present === 'boolean'
      );
    }
    case 'coverEnumValue': {
      const params = candidate.params as { valueIndex?: unknown } | undefined;
      return (
        !!params &&
        typeof params.valueIndex === 'number' &&
        Number.isInteger(params.valueIndex)
      );
    }
    default:
      return false;
  }
}

function buildSortableTargets(
  targets: CoverageTarget[],
  dimensionPriority: CoverageDimension[]
): SortableTarget[] {
  const dimensionIndexByName = new Map<string, number>();
  dimensionPriority.forEach((dim, index) => {
    dimensionIndexByName.set(dim, index);
  });

  return targets
    .filter((t) => t.status === undefined || t.status === 'active')
    .map((target) => {
      const operationKey = target.operationKey ?? '';
      const dimensionIndex =
        dimensionIndexByName.get(target.dimension) ?? Number.MAX_SAFE_INTEGER;
      const weight =
        typeof target.weight === 'number' && Number.isFinite(target.weight)
          ? target.weight
          : 0;
      return {
        target,
        operationKey,
        dimensionIndex,
        weight,
      };
    });
}

function sortTargetsForPlanning(sortable: SortableTarget[]): SortableTarget[] {
  return sortable.slice().sort((a, b) => {
    // Operations first when present
    const aHasOp = a.operationKey !== '';
    const bHasOp = b.operationKey !== '';
    if (aHasOp !== bHasOp) {
      return aHasOp ? -1 : 1;
    }

    // Dimension priority
    if (a.dimensionIndex !== b.dimensionIndex) {
      return a.dimensionIndex - b.dimensionIndex;
    }

    // Weight (higher weight first)
    if (a.weight !== b.weight) {
      return b.weight - a.weight;
    }

    // Canonical path
    if (a.target.canonPath !== b.target.canonPath) {
      return a.target.canonPath < b.target.canonPath ? -1 : 1;
    }

    // Stable tie-breaker on target id
    if (a.target.id !== b.target.id) {
      return a.target.id < b.target.id ? -1 : 1;
    }

    return 0;
  });
}

export function planTestUnits(input: CoveragePlannerInput): TestUnit[] {
  const {
    targets,
    config: {
      budget: { maxInstances },
      dimensionPriority,
    },
  } = input;

  if (!Number.isFinite(maxInstances) || maxInstances <= 0) {
    return [];
  }

  const sortable = buildSortableTargets(targets, dimensionPriority);
  if (sortable.length === 0) {
    return [];
  }

  const ordered = sortTargetsForPlanning(sortable);
  const units: TestUnit[] = [];

  let remaining = Math.floor(maxInstances);
  let nextUnitId = 0;

  for (const entry of ordered) {
    if (remaining <= 0) break;

    const target = entry.target;
    const unitCount = 1;

    const unit: TestUnit = {
      id: `tu-${nextUnitId}`,
      // Seed derivation is delegated to a dedicated sub-task.
      seed: 0,
      count: unitCount,
      hints: [],
      scope: {
        operationKey: target.operationKey,
        schemaPaths: [target.canonPath],
      },
    };

    units.push(unit);
    remaining -= unitCount;
    nextUnitId += 1;
  }

  return units;
}

export interface TestUnitSeedOptions {
  masterSeed: number;
}

export function assignTestUnitSeeds(
  units: TestUnit[],
  options: TestUnitSeedOptions
): TestUnit[] {
  const baseSeed = normalizeSeed(options.masterSeed);
  return units.map((unit) => {
    const scopeKey =
      unit.scope?.operationKey ?? unit.scope?.schemaPaths?.[0] ?? '';
    const canonPtr = `${unit.id}|${scopeKey}`;
    const rng = new XorShift32(baseSeed, canonPtr);
    const seed = rng.next();
    return {
      ...unit,
      seed,
    };
  });
}
