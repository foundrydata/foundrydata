import type {
  CoverageDimension,
  CoverageTarget,
  PlannerCapHit,
} from '@foundrydata/shared';
import type { CoveragePlannerConfig } from './coverage-planner.js';

interface PlannerScopeKey {
  dimension: CoverageDimension | string;
  scopeType: 'schema' | 'operation';
  scopeKey: string;
}

interface PlannerScopeStats {
  totalTargets: number;
  plannedTargets: number;
}

export interface ApplyPlannerCapsResult {
  plannedTargetIds: Set<string>;
  updatedTargets: CoverageTarget[];
  capsHit: PlannerCapHit[];
}

// eslint-disable-next-line max-lines-per-function, complexity
export function applyPlannerCaps(
  targets: CoverageTarget[],
  config: CoveragePlannerConfig
): ApplyPlannerCapsResult {
  const caps = config.caps;
  if (!caps) {
    return {
      plannedTargetIds: new Set(targets.map((t) => t.id)),
      updatedTargets: targets,
      capsHit: [],
    };
  }

  const maxPerDimension =
    caps.maxTargetsPerDimension &&
    Object.keys(caps.maxTargetsPerDimension).length
      ? caps.maxTargetsPerDimension
      : undefined;

  const maxPerSchema = caps.maxTargetsPerSchema;
  const maxPerOperation = caps.maxTargetsPerOperation;

  const scopeStats = new Map<string, PlannerScopeStats>();
  const plannedTargetIds = new Set<string>();

  const getDimensionLimit = (dimension: CoverageDimension | string): number => {
    if (!maxPerDimension) return Number.POSITIVE_INFINITY;
    const specific = maxPerDimension[dimension];
    if (typeof specific === 'number' && specific > 0) return specific;
    return Number.POSITIVE_INFINITY;
  };

  const makeScopeKey = (scope: PlannerScopeKey): string =>
    `${scope.dimension}|${scope.scopeType}|${scope.scopeKey}`;

  for (const target of targets) {
    if (target.status && target.status !== 'active') {
      continue;
    }
    const dimension: CoverageDimension | string = target.dimension;
    const canonPath = target.canonPath || '';
    const operationKey = target.operationKey ?? '';

    const dimensionLimit = getDimensionLimit(dimension);

    const schemaScope: PlannerScopeKey = {
      dimension,
      scopeType: 'schema',
      scopeKey: canonPath,
    };

    const opScope: PlannerScopeKey | undefined = operationKey
      ? {
          dimension,
          scopeType: 'operation',
          scopeKey: operationKey,
        }
      : undefined;

    const schemaKey = makeScopeKey(schemaScope);
    const schemaStats = scopeStats.get(schemaKey) ?? {
      totalTargets: 0,
      plannedTargets: 0,
    };
    schemaStats.totalTargets += 1;
    scopeStats.set(schemaKey, schemaStats);

    let opKey: string | undefined;
    let opStats: PlannerScopeStats | undefined;
    if (opScope) {
      opKey = makeScopeKey(opScope);
      opStats = scopeStats.get(opKey) ?? { totalTargets: 0, plannedTargets: 0 };
      opStats.totalTargets += 1;
      scopeStats.set(opKey, opStats);
    }

    const schemaLimit =
      typeof maxPerSchema === 'number' && maxPerSchema > 0
        ? maxPerSchema
        : Number.POSITIVE_INFINITY;
    const opLimit =
      typeof maxPerOperation === 'number' && maxPerOperation > 0
        ? maxPerOperation
        : Number.POSITIVE_INFINITY;

    const dimensionKey = String(dimension);
    const dimensionKeyScope: PlannerScopeKey = {
      dimension,
      scopeType: 'schema',
      scopeKey: `dimension:${dimensionKey}`,
    };
    const dimensionScopeKey = makeScopeKey(dimensionKeyScope);
    const dimensionStats = scopeStats.get(dimensionScopeKey) ?? {
      totalTargets: 0,
      plannedTargets: 0,
    };
    dimensionStats.totalTargets += 1;
    scopeStats.set(dimensionScopeKey, dimensionStats);

    const dimensionRemaining = dimensionLimit - dimensionStats.plannedTargets;
    const schemaRemaining = schemaLimit - schemaStats.plannedTargets;
    const opRemaining =
      opStats && opKey
        ? opLimit - opStats.plannedTargets
        : Number.POSITIVE_INFINITY;

    const canPlan =
      dimensionRemaining > 0 && schemaRemaining > 0 && opRemaining > 0;

    if (canPlan) {
      dimensionStats.plannedTargets += 1;
      scopeStats.set(dimensionScopeKey, dimensionStats);
      schemaStats.plannedTargets += 1;
      scopeStats.set(schemaKey, schemaStats);
      if (opStats && opKey) {
        opStats.plannedTargets += 1;
        scopeStats.set(opKey, opStats);
      }
      plannedTargetIds.add(target.id);
    }
  }

  const updatedTargets: CoverageTarget[] = targets.map((target) => {
    if (plannedTargetIds.has(target.id)) {
      return target;
    }
    const existingMeta =
      target.meta && typeof target.meta === 'object'
        ? (target.meta as Record<string, unknown>)
        : {};
    if (existingMeta.planned === false) {
      return target;
    }
    return {
      ...target,
      meta: { ...existingMeta, planned: false },
    } as CoverageTarget;
  });

  const capsHit: PlannerCapHit[] = [];
  for (const [key, stats] of scopeStats.entries()) {
    const { totalTargets, plannedTargets } = stats;
    if (totalTargets <= plannedTargets) {
      continue;
    }
    const [dimension, scopeType, scopeKey] = key.split('|') as [
      string,
      string,
      string,
    ];
    capsHit.push({
      dimension,
      scopeType: scopeType as PlannerCapHit['scopeType'],
      scopeKey,
      totalTargets,
      plannedTargets,
      unplannedTargets: totalTargets - plannedTargets,
    });
  }

  return {
    plannedTargetIds,
    updatedTargets,
    capsHit,
  };
}
