/* eslint-disable max-lines-per-function */
/* eslint-disable max-lines */
/* eslint-disable complexity */
import type {
  CoverageDimension,
  CoverageTargetKind,
  CoverageTarget,
  CoverageTargetReport,
} from '@foundrydata/shared';

export interface SchemaNodeHitEvent {
  dimension: 'structure';
  kind: 'SCHEMA_NODE';
  /**
   * Canonical JSON Pointer for the schema node (e.g. '#', '#/properties/id').
   */
  canonPath: string;
  /**
   * Optional operation key for API-linked schema nodes.
   */
  operationKey?: string;
}

export interface PropertyPresentHitEvent {
  dimension: 'structure';
  kind: 'PROPERTY_PRESENT';
  canonPath: string;
  operationKey?: string;
  params: {
    propertyName: string;
  };
}

export interface OneOfBranchHitEvent {
  dimension: 'branches';
  kind: 'ONEOF_BRANCH';
  canonPath: string;
  operationKey?: string;
  params: {
    index: number;
  };
}

export interface AnyOfBranchHitEvent {
  dimension: 'branches';
  kind: 'ANYOF_BRANCH';
  canonPath: string;
  operationKey?: string;
  params: {
    index: number;
  };
}

export interface ConditionalPathHitEvent {
  dimension: 'branches';
  kind: 'CONDITIONAL_PATH';
  canonPath: string;
  operationKey?: string;
  params: {
    pathKind: string;
  };
}

export interface EnumValueHitEvent {
  dimension: 'enum';
  kind: 'ENUM_VALUE_HIT';
  canonPath: string;
  operationKey?: string;
  params: {
    enumIndex: number;
    value?: unknown;
  };
}

export interface NumericBoundaryHitEvent {
  dimension: 'boundaries';
  kind: 'NUMERIC_MIN_HIT' | 'NUMERIC_MAX_HIT';
  canonPath: string;
  operationKey?: string;
  params: {
    boundaryKind: string;
    boundaryValue: number;
  };
}

export interface StringBoundaryHitEvent {
  dimension: 'boundaries';
  kind: 'STRING_MIN_LENGTH_HIT' | 'STRING_MAX_LENGTH_HIT';
  canonPath: string;
  operationKey?: string;
  params: {
    boundaryKind: string;
    boundaryValue: number;
  };
}

export interface ArrayBoundaryHitEvent {
  dimension: 'boundaries';
  kind: 'ARRAY_MIN_ITEMS_HIT' | 'ARRAY_MAX_ITEMS_HIT';
  canonPath: string;
  operationKey?: string;
  params: {
    boundaryKind: string;
    boundaryValue: number;
  };
}

export type CoverageEvent =
  | SchemaNodeHitEvent
  | PropertyPresentHitEvent
  | OneOfBranchHitEvent
  | AnyOfBranchHitEvent
  | ConditionalPathHitEvent
  | EnumValueHitEvent
  | NumericBoundaryHitEvent
  | StringBoundaryHitEvent
  | ArrayBoundaryHitEvent;

export interface InstanceCoverageState {
  /**
   * Record a coverage event for a single candidate instance.
   * This must not mutate any global coverage bitmaps; hits are
   * only propagated when the instance is explicitly committed.
   */
  record(event: CoverageEvent): void;

  /**
   * Return the set of CoverageTarget IDs hit for this instance.
   */
  getHitTargetIds(): ReadonlySet<string>;

  /**
   * Reset the per-instance state so it can be reused for a new
   * candidate instance without affecting previously committed hits.
   */
  reset(): void;
}

export interface CoverageAccumulator {
  /**
   * Record a coverage event for a single emitted instance.
   * Events are projected onto CoverageTargets based on their
   * (dimension, kind, canonPath, operationKey, params) identity.
   */
  record(event: CoverageEvent): void;

  /**
   * Mark a CoverageTarget as hit directly by ID. This is useful
   * for integration points that already know the target identity
   * (for example, future planner hints).
   */
  markTargetHit(targetId: string): void;

  /**
   * Check whether a target with the given ID has been hit.
   */
  isHit(targetId: string): boolean;

  /**
   * Return the current set of hit CoverageTarget IDs.
   */
  getHitTargetIds(): ReadonlySet<string>;

  /**
   * Project hit information onto a list of CoverageTargets,
   * producing CoverageTargetReport entries.
   *
   * This function is pure with respect to the provided list:
   * it never mutates the input targets.
   */
  toReport(targets: CoverageTarget[]): CoverageTargetReport[];
}

export interface StreamingCoverageAccumulator extends CoverageAccumulator {
  /**
   * Create a fresh per-instance coverage state that shares the
   * same target index as the global accumulator.
   */
  createInstanceState(): InstanceCoverageState;

  /**
   * Commit hits from a per-instance state into the global bitmap.
   * After commit, the per-instance state can be safely reused.
   */
  commitInstance(state: InstanceCoverageState): void;
}

interface TargetIdentity {
  dimension: CoverageDimension;
  kind: CoverageTargetKind;
  canonPath: string;
  operationKey?: string;
  paramsKey?: string;
}

function buildParamsKeyFromTarget(
  kind: CoverageTargetKind,
  params: Record<string, unknown> | undefined
): string | undefined {
  if (!params) return undefined;

  if (kind === 'PROPERTY_PRESENT') {
    const name = params.propertyName;
    return typeof name === 'string' ? `propertyName:${name}` : undefined;
  }

  if (kind === 'ONEOF_BRANCH' || kind === 'ANYOF_BRANCH') {
    const index = params.index;
    return typeof index === 'number' && Number.isFinite(index)
      ? `index:${index}`
      : undefined;
  }

  if (kind === 'CONDITIONAL_PATH') {
    const pathKind = params.pathKind;
    return typeof pathKind === 'string' ? `pathKind:${pathKind}` : undefined;
  }

  if (kind === 'ENUM_VALUE_HIT') {
    const enumIndex = params.enumIndex;
    return typeof enumIndex === 'number' && Number.isFinite(enumIndex)
      ? `enumIndex:${enumIndex}`
      : undefined;
  }

  if (
    kind === 'NUMERIC_MIN_HIT' ||
    kind === 'NUMERIC_MAX_HIT' ||
    kind === 'STRING_MIN_LENGTH_HIT' ||
    kind === 'STRING_MAX_LENGTH_HIT' ||
    kind === 'ARRAY_MIN_ITEMS_HIT' ||
    kind === 'ARRAY_MAX_ITEMS_HIT'
  ) {
    const boundaryKind = params.boundaryKind;
    return typeof boundaryKind === 'string'
      ? `boundaryKind:${boundaryKind}`
      : undefined;
  }

  return undefined;
}

function buildIdentityKey(identity: TargetIdentity): string {
  const op = identity.operationKey ?? '';
  const paramsKey = identity.paramsKey ?? '';
  return [
    identity.dimension,
    identity.kind,
    identity.canonPath,
    op,
    paramsKey,
  ].join('|');
}

function buildTargetIdentity(
  target: CoverageTarget
): TargetIdentity | undefined {
  const canonPath = target.canonPath;
  if (!canonPath) return undefined;

  const kind = target.kind;

  if (
    kind !== 'SCHEMA_NODE' &&
    kind !== 'PROPERTY_PRESENT' &&
    kind !== 'ONEOF_BRANCH' &&
    kind !== 'ANYOF_BRANCH' &&
    kind !== 'CONDITIONAL_PATH' &&
    kind !== 'ENUM_VALUE_HIT' &&
    kind !== 'NUMERIC_MIN_HIT' &&
    kind !== 'NUMERIC_MAX_HIT' &&
    kind !== 'STRING_MIN_LENGTH_HIT' &&
    kind !== 'STRING_MAX_LENGTH_HIT' &&
    kind !== 'ARRAY_MIN_ITEMS_HIT' &&
    kind !== 'ARRAY_MAX_ITEMS_HIT'
  ) {
    return undefined;
  }

  const params =
    target.params && typeof target.params === 'object'
      ? (target.params as Record<string, unknown>)
      : undefined;

  const paramsKey = buildParamsKeyFromTarget(kind, params);

  return {
    dimension: target.dimension,
    kind,
    canonPath,
    operationKey: target.operationKey,
    paramsKey,
  };
}

function buildParamsKeyFromEvent(event: CoverageEvent): string | undefined {
  if (event.kind === 'PROPERTY_PRESENT') {
    const name = event.params?.propertyName;
    return typeof name === 'string' ? `propertyName:${name}` : undefined;
  }

  if (event.kind === 'ONEOF_BRANCH' || event.kind === 'ANYOF_BRANCH') {
    const index = event.params?.index;
    return typeof index === 'number' && Number.isFinite(index)
      ? `index:${index}`
      : undefined;
  }

  if (event.kind === 'CONDITIONAL_PATH') {
    const pathKind = event.params?.pathKind;
    return typeof pathKind === 'string' ? `pathKind:${pathKind}` : undefined;
  }

  if (event.kind === 'ENUM_VALUE_HIT') {
    const enumIndex = event.params?.enumIndex;
    return typeof enumIndex === 'number' && Number.isFinite(enumIndex)
      ? `enumIndex:${enumIndex}`
      : undefined;
  }

  if (
    event.kind === 'NUMERIC_MIN_HIT' ||
    event.kind === 'NUMERIC_MAX_HIT' ||
    event.kind === 'STRING_MIN_LENGTH_HIT' ||
    event.kind === 'STRING_MAX_LENGTH_HIT' ||
    event.kind === 'ARRAY_MIN_ITEMS_HIT' ||
    event.kind === 'ARRAY_MAX_ITEMS_HIT'
  ) {
    const boundaryKind = event.params?.boundaryKind;
    return typeof boundaryKind === 'string'
      ? `boundaryKind:${boundaryKind}`
      : undefined;
  }

  return undefined;
}

function buildEventIdentityKey(event: CoverageEvent): string | undefined {
  const canonPath = event.canonPath;
  if (!canonPath) return undefined;

  const paramsKey = buildParamsKeyFromEvent(event);

  const identity: TargetIdentity = {
    dimension: event.dimension,
    kind: event.kind as CoverageTargetKind,
    canonPath,
    operationKey: event.operationKey,
    paramsKey,
  };

  return buildIdentityKey(identity);
}

function buildTargetIdIndex(targets: CoverageTarget[]): Map<string, string> {
  const targetIdByKey = new Map<string, string>();

  for (const target of targets) {
    const identity = buildTargetIdentity(target);
    if (!identity) continue;
    const key = buildIdentityKey(identity);
    if (!targetIdByKey.has(key)) {
      targetIdByKey.set(key, target.id);
    }
  }

  return targetIdByKey;
}

function resolveEventTargetId(
  targetIdByKey: Map<string, string>,
  event: CoverageEvent
): string | undefined {
  const key = buildEventIdentityKey(event);
  if (!key) return undefined;
  return targetIdByKey.get(key);
}

export function createStreamingCoverageAccumulator(
  targets: CoverageTarget[]
): StreamingCoverageAccumulator {
  const targetIdByKey = buildTargetIdIndex(targets);
  const globalHitTargetIds = new Set<string>();

  const record = (event: CoverageEvent): void => {
    const key = buildEventIdentityKey(event);
    if (!key) return;
    const targetId = targetIdByKey.get(key);
    if (targetId !== undefined) {
      globalHitTargetIds.add(targetId);
    }
  };

  const markTargetHit = (targetId: string): void => {
    if (!targetId) return;
    globalHitTargetIds.add(targetId);
  };

  const isHit = (targetId: string): boolean => globalHitTargetIds.has(targetId);

  const getHitTargetIds = (): ReadonlySet<string> => globalHitTargetIds;

  const toReport = (allTargets: CoverageTarget[]): CoverageTargetReport[] =>
    allTargets.map((target) => ({
      ...target,
      hit: globalHitTargetIds.has(target.id),
    }));

  const createInstanceState = (): InstanceCoverageState => {
    const instanceHits = new Set<string>();

    const instanceRecord = (event: CoverageEvent): void => {
      const targetId = resolveEventTargetId(targetIdByKey, event);
      if (targetId !== undefined) {
        instanceHits.add(targetId);
      }
    };

    const instanceGetHitTargetIds = (): ReadonlySet<string> => instanceHits;

    const reset = (): void => {
      instanceHits.clear();
    };

    return {
      record: instanceRecord,
      getHitTargetIds: instanceGetHitTargetIds,
      reset,
    };
  };

  const commitInstance = (state: InstanceCoverageState): void => {
    for (const targetId of state.getHitTargetIds()) {
      globalHitTargetIds.add(targetId);
    }
    state.reset();
  };

  return {
    record,
    markTargetHit,
    isHit,
    getHitTargetIds,
    toReport,
    createInstanceState,
    commitInstance,
  };
}

export function createCoverageAccumulator(
  targets: CoverageTarget[]
): CoverageAccumulator {
  const targetIdByKey = buildTargetIdIndex(targets);

  const hitTargetIds = new Set<string>();

  const record = (event: CoverageEvent): void => {
    const targetId = resolveEventTargetId(targetIdByKey, event);
    if (targetId !== undefined) {
      hitTargetIds.add(targetId);
    }
  };

  const markTargetHit = (targetId: string): void => {
    if (!targetId) return;
    hitTargetIds.add(targetId);
  };

  const isHit = (targetId: string): boolean => hitTargetIds.has(targetId);

  const getHitTargetIds = (): ReadonlySet<string> => hitTargetIds;

  const toReport = (allTargets: CoverageTarget[]): CoverageTargetReport[] =>
    allTargets.map((target) => ({
      ...target,
      hit: hitTargetIds.has(target.id),
    }));

  return {
    record,
    markTargetHit,
    isHit,
    getHitTargetIds,
    toReport,
  };
}
