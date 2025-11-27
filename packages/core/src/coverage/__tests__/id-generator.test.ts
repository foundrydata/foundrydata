import { describe, it, expect } from 'vitest';
import type {
  CoverageDimension,
  CoverageStatus,
  CoveragePolarity,
} from '@foundrydata/shared';
import { computeCoverageTargetId } from '../id-generator';

interface TestCoverageTarget {
  id: string;
  dimension: CoverageDimension;
  kind: 'SCHEMA_NODE' | 'PROPERTY_PRESENT';
  canonPath: string;
  operationKey?: string;
  params?: Record<string, unknown>;
  status?: CoverageStatus;
  weight?: number;
  polarity?: CoveragePolarity;
  meta?: Record<string, unknown>;
}

const BASE_CONTEXT = {
  engineMajorVersion: 0,
  reportFormatMajorVersion: 1,
} as const;

function makeTarget(
  overrides: Partial<TestCoverageTarget> = {}
): TestCoverageTarget {
  const base: TestCoverageTarget = {
    id: 'placeholder',
    dimension: 'structure',
    kind: 'SCHEMA_NODE',
    canonPath: '#/properties/name',
    status: 'active',
  };
  return { ...base, ...overrides };
}

describe('computeCoverageTargetId', () => {
  it('produces stable IDs for identical canonical inputs', () => {
    const target = makeTarget();
    const id1 = computeCoverageTargetId(target, BASE_CONTEXT);
    const id2 = computeCoverageTargetId({ ...target }, BASE_CONTEXT);
    expect(id1).toBe(id2);
  });

  it('does not depend on runtime coverage fields', () => {
    const base = makeTarget();

    const withStatus = computeCoverageTargetId(
      { ...base, status: 'unreachable' },
      BASE_CONTEXT
    );
    const withWeight = computeCoverageTargetId(
      { ...base, weight: 5 },
      BASE_CONTEXT
    );
    const withPolarity = computeCoverageTargetId(
      { ...base, polarity: 'negative' },
      BASE_CONTEXT
    );
    const withMeta = computeCoverageTargetId(
      { ...base, meta: { note: 'x' } },
      BASE_CONTEXT
    );
    const baseId = computeCoverageTargetId(base, BASE_CONTEXT);

    expect(withStatus).toBe(baseId);
    expect(withWeight).toBe(baseId);
    expect(withPolarity).toBe(baseId);
    expect(withMeta).toBe(baseId);
  });

  it('changes when canonical identity fields change', () => {
    const base = makeTarget();

    const differentDimension = makeTarget({ dimension: 'branches' });
    const differentKind = makeTarget({ kind: 'PROPERTY_PRESENT' });
    const differentPath = makeTarget({ canonPath: '#/properties/other' });
    const differentOp = makeTarget({ operationKey: 'GET /users' });
    const differentParams = makeTarget({ params: { branchIndex: 1 } });

    const baseId = computeCoverageTargetId(base, BASE_CONTEXT);

    expect(computeCoverageTargetId(differentDimension, BASE_CONTEXT)).not.toBe(
      baseId
    );
    expect(computeCoverageTargetId(differentKind, BASE_CONTEXT)).not.toBe(
      baseId
    );
    expect(computeCoverageTargetId(differentPath, BASE_CONTEXT)).not.toBe(
      baseId
    );
    expect(computeCoverageTargetId(differentOp, BASE_CONTEXT)).not.toBe(baseId);
    expect(computeCoverageTargetId(differentParams, BASE_CONTEXT)).not.toBe(
      baseId
    );
  });

  it('encodes engine and report major versions in the ID', () => {
    const target = makeTarget();

    const idEngine0Report1 = computeCoverageTargetId(target, {
      engineMajorVersion: 0,
      reportFormatMajorVersion: 1,
    });
    const idEngine1Report1 = computeCoverageTargetId(target, {
      engineMajorVersion: 1,
      reportFormatMajorVersion: 1,
    });
    const idEngine0Report2 = computeCoverageTargetId(target, {
      engineMajorVersion: 0,
      reportFormatMajorVersion: 2,
    });

    expect(idEngine0Report1).not.toBe(idEngine1Report1);
    expect(idEngine0Report1).not.toBe(idEngine0Report2);
  });
});
