import { describe, it, expect } from 'vitest';

import type { CoverageTarget } from '@foundrydata/shared';
import { DIAGNOSTIC_CODES, type DiagnosticCode } from '../../diag/codes.js';
import type { ComposeDiagnostics } from '../../transform/composition-engine.js';
import {
  applyUnreachableStatusToTargets,
  buildUnsatPathSet,
} from '../coverage-analyzer-unreachable.js';

function makeTargetsForPathTests(): CoverageTarget[] {
  return [
    {
      id: 't-root',
      dimension: 'structure',
      kind: 'SCHEMA_NODE',
      canonPath: '#',
      status: 'active',
    },
    {
      id: 't-direct',
      dimension: 'boundaries',
      kind: 'NUMERIC_MIN_HIT',
      canonPath: '#/properties/n',
      status: 'active',
    },
    {
      id: 't-nested',
      dimension: 'boundaries',
      kind: 'NUMERIC_MAX_HIT',
      canonPath: '#/properties/n/minimum',
      status: 'active',
    },
    {
      id: 't-other',
      dimension: 'structure',
      kind: 'SCHEMA_NODE',
      canonPath: '#/properties/other',
      status: 'active',
    },
    {
      id: 't-diagnostic',
      dimension: 'operations',
      kind: 'SCHEMA_REUSED_COVERED',
      canonPath: '#/components/schemas/User',
      status: 'deprecated',
      meta: { existing: true },
    },
  ];
}

function makeComposeDiagnostics(
  strongCodes: Array<{ code: DiagnosticCode; canonPath: string }>,
  weakCodes: Array<{ code: DiagnosticCode; canonPath: string }> = []
): ComposeDiagnostics {
  return {
    fatal: strongCodes.map(({ code, canonPath }) => ({
      code,
      canonPath,
      details: { source: 'fatal' },
    })),
    unsatHints: [
      ...weakCodes.map(({ code, canonPath }) => ({
        code,
        canonPath,
        provable: true,
        details: { source: 'weak-hint' },
      })),
    ],
  };
}

describe('buildUnsatPathSet', () => {
  it('collects canonPaths only for strong UNSAT / guardrail codes', () => {
    const diag: ComposeDiagnostics = {
      fatal: [
        {
          code: DIAGNOSTIC_CODES.UNSAT_AP_FALSE_EMPTY_COVERAGE,
          canonPath: '#/apFalse',
        },
        {
          code: DIAGNOSTIC_CODES.UNSAT_NUMERIC_BOUNDS,
          canonPath: '#/numeric',
        },
        {
          // Not in STRONG_UNSAT_CODES, should be ignored.
          code: DIAGNOSTIC_CODES.UNSAT_BUDGET_EXHAUSTED,
          canonPath: '#/budget',
        },
      ],
      unsatHints: [
        {
          code: DIAGNOSTIC_CODES.UNSAT_MINPROPERTIES_VS_COVERAGE,
          canonPath: '#/minProps',
          provable: true,
        },
        {
          // Weak unsat hint, should be ignored even if provable.
          code: DIAGNOSTIC_CODES.AP_FALSE_INTERSECTION_APPROX,
          canonPath: '#/approx',
          provable: true,
        },
      ],
    };

    const result = buildUnsatPathSet(diag);

    expect(result.has('#/apFalse')).toBe(true);
    expect(result.has('#/numeric')).toBe(true);
    expect(result.has('#/minProps')).toBe(true);
    expect(result.has('#/budget')).toBe(false);
    expect(result.has('#/approx')).toBe(false);
  });

  it('returns an empty set when there are no strong UNSAT diagnostics', () => {
    const diag: ComposeDiagnostics = {
      fatal: [
        {
          code: DIAGNOSTIC_CODES.AP_FALSE_INTERSECTION_APPROX,
          canonPath: '#/approx',
        },
      ],
      unsatHints: [
        {
          code: DIAGNOSTIC_CODES.UNSAT_BUDGET_EXHAUSTED,
          canonPath: '#/budget',
          provable: true,
        },
      ],
    };

    const result = buildUnsatPathSet(diag);

    expect(result.size).toBe(0);
  });
});

describe('applyUnreachableStatusToTargets', () => {
  it('returns original targets when there is no diagnostics payload', () => {
    const targets = makeTargetsForPathTests();
    const updated = applyUnreachableStatusToTargets(targets, undefined);

    expect(updated).toHaveLength(targets.length);
    expect(
      updated.every((t, index) => t.status === targets[index]?.status)
    ).toBe(true);
  });

  it('marks targets as unreachable when their canonPath matches or is nested under a strong UNSAT path', () => {
    const targets = makeTargetsForPathTests();
    const diag = makeComposeDiagnostics([
      {
        code: DIAGNOSTIC_CODES.UNSAT_NUMERIC_BOUNDS,
        canonPath: '#/properties/n',
      },
    ]);

    const updated = applyUnreachableStatusToTargets(targets, diag);

    const byId = new Map(updated.map((t) => [t.id, t]));
    expect(byId.get('t-direct')?.status).toBe('unreachable');
    expect(byId.get('t-nested')?.status).toBe('unreachable');

    // Other targets remain unchanged.
    expect(byId.get('t-root')?.status).toBe('active');
    expect(byId.get('t-other')?.status).toBe('active');
  });

  it('derives unreachable only from strong UNSAT codes, ignoring weaker diagnostics', () => {
    const targets = makeTargetsForPathTests();
    const diag = makeComposeDiagnostics(
      [
        {
          code: DIAGNOSTIC_CODES.UNSAT_REQUIRED_AP_FALSE,
          canonPath: '#/properties/n',
        },
      ],
      [
        {
          code: DIAGNOSTIC_CODES.UNSAT_BUDGET_EXHAUSTED,
          canonPath: '#/properties/n',
        },
      ]
    );

    const updated = applyUnreachableStatusToTargets(targets, diag);
    const byId = new Map(updated.map((t) => [t.id, t]));

    expect(byId.get('t-direct')?.status).toBe('unreachable');
    expect(byId.get('t-nested')?.status).toBe('unreachable');
  });

  it('uses only provable unsatHints and ignores non-provable ones', () => {
    const targets = makeTargetsForPathTests();
    const diag: ComposeDiagnostics = {
      unsatHints: [
        {
          code: DIAGNOSTIC_CODES.UNSAT_MINPROPERTIES_VS_COVERAGE,
          canonPath: '#/properties/n',
          provable: true,
          details: { from: 'provable-hint' },
        },
        {
          code: DIAGNOSTIC_CODES.UNSAT_MINPROPS_PNAMES,
          canonPath: '#/properties/other',
          provable: false,
        },
      ],
    };

    const updated = applyUnreachableStatusToTargets(targets, diag);
    const byId = new Map(updated.map((t) => [t.id, t]));

    expect(byId.get('t-direct')?.status).toBe('unreachable');
    expect(byId.get('t-nested')?.status).toBe('unreachable');
    expect(byId.get('t-other')?.status).toBe('active');
  });

  it('preserves SCHEMA_REUSED_COVERED status as deprecated while attaching conflict metadata', () => {
    const targets = makeTargetsForPathTests();
    const diag = makeComposeDiagnostics([
      {
        code: DIAGNOSTIC_CODES.UNSAT_AP_FALSE_EMPTY_COVERAGE,
        canonPath: '#/components/schemas/User',
      },
    ]);

    const updated = applyUnreachableStatusToTargets(targets, diag);
    const diagnosticTarget = updated.find(
      (t) => t.id === 't-diagnostic'
    ) as CoverageTarget;

    expect(diagnosticTarget.status).toBe('deprecated');
    expect(diagnosticTarget.meta).toBeDefined();
    expect(diagnosticTarget.meta && 'existing' in diagnosticTarget.meta).toBe(
      true
    );
    expect(
      diagnosticTarget.meta && diagnosticTarget.meta.conflictDetected
    ).toBe(true);
    expect(
      diagnosticTarget.meta?.conflictReasonCode ===
        DIAGNOSTIC_CODES.UNSAT_AP_FALSE_EMPTY_COVERAGE
    ).toBe(true);
    expect(diagnosticTarget.meta?.conflictReasonCanonPath).toBe(
      '#/components/schemas/User'
    );
  });
});
