import { describe, it, expect } from 'vitest';
import type { CoverageDimension } from '@foundrydata/shared';
import {
  applyPlannerCaps,
  resolveCoveragePlannerConfig,
  type CoveragePlannerConfig,
  type CoveragePlannerInput,
} from '../index.js';

const BRANCHES: CoverageDimension = 'branches';
const STRUCTURE: CoverageDimension = 'structure';

describe('applyPlannerCaps', () => {
  const makeConfig = (
    caps?: CoveragePlannerConfig['caps']
  ): CoveragePlannerConfig =>
    resolveCoveragePlannerConfig({
      maxInstances: 10,
      dimensionsEnabled: [BRANCHES, STRUCTURE],
      dimensionPriority: [BRANCHES, STRUCTURE],
      caps,
    });

  it('plans all targets when no caps are configured', () => {
    const targets: CoveragePlannerInput['targets'] = [
      {
        id: 't1',
        dimension: BRANCHES,
        kind: 'ONEOF_BRANCH',
        canonPath: '#/oneOf/0',
      },
      {
        id: 't2',
        dimension: BRANCHES,
        kind: 'ONEOF_BRANCH',
        canonPath: '#/oneOf/1',
      },
    ];

    const config = makeConfig();
    const { plannedTargetIds, updatedTargets, capsHit } = applyPlannerCaps(
      targets,
      config
    );

    expect(plannedTargetIds.size).toBe(2);
    expect(Array.from(plannedTargetIds).sort()).toEqual(['t1', 't2']);
    expect(updatedTargets.every((t) => t.meta?.planned !== false)).toBe(true);
    expect(capsHit).toEqual([]);
  });

  it('applies dimension caps and marks unplanned targets', () => {
    const targets: CoveragePlannerInput['targets'] = [
      {
        id: 'b1',
        dimension: BRANCHES,
        kind: 'ONEOF_BRANCH',
        canonPath: '#/oneOf/0',
      },
      {
        id: 'b2',
        dimension: BRANCHES,
        kind: 'ONEOF_BRANCH',
        canonPath: '#/oneOf/1',
      },
      {
        id: 'b3',
        dimension: BRANCHES,
        kind: 'ONEOF_BRANCH',
        canonPath: '#/oneOf/2',
      },
    ];

    const config = makeConfig({
      maxTargetsPerDimension: { [BRANCHES]: 2 },
    });

    const { plannedTargetIds, updatedTargets, capsHit } = applyPlannerCaps(
      targets,
      config
    );

    expect(plannedTargetIds.size).toBe(2);
    expect(updatedTargets.filter((t) => t.meta?.planned === false).length).toBe(
      1
    );
    expect(capsHit.length).toBeGreaterThan(0);
    const dimensionCaps = capsHit.filter(
      (hit) => hit.dimension === BRANCHES && hit.scopeType === 'schema'
    );
    expect(dimensionCaps.length).toBeGreaterThan(0);
    for (const hit of dimensionCaps) {
      expect(hit.totalTargets).toBeGreaterThanOrEqual(hit.plannedTargets);
      expect(hit.unplannedTargets).toBe(hit.totalTargets - hit.plannedTargets);
    }
  });

  it('applies operation caps independently of global dimension caps', () => {
    const targets: CoveragePlannerInput['targets'] = [
      {
        id: 'op1-a',
        dimension: BRANCHES,
        kind: 'ONEOF_BRANCH',
        canonPath: '#/oneOf/0',
        operationKey: 'GET /a',
      },
      {
        id: 'op1-b',
        dimension: BRANCHES,
        kind: 'ONEOF_BRANCH',
        canonPath: '#/oneOf/1',
        operationKey: 'GET /a',
      },
      {
        id: 'op2-a',
        dimension: BRANCHES,
        kind: 'ONEOF_BRANCH',
        canonPath: '#/oneOf/0',
        operationKey: 'GET /b',
      },
    ];

    const config = makeConfig({
      maxTargetsPerDimension: { [BRANCHES]: 3 },
      maxTargetsPerOperation: 1,
    });

    const { plannedTargetIds, updatedTargets, capsHit } = applyPlannerCaps(
      targets,
      config
    );

    expect(plannedTargetIds.size).toBe(2);
    const unplanned = updatedTargets.filter(
      (t) => t.meta && t.meta.planned === false
    );
    expect(unplanned.length).toBe(1);
    const opCaps = capsHit.filter((hit) => hit.scopeType === 'operation');
    expect(opCaps.length).toBeGreaterThan(0);
  });
});
