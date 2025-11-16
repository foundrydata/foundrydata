import { describe, it, expect } from 'vitest';
import {
  chooseClosedEnumRenameCandidate,
  RepairEngine,
} from '../../repair/repair-engine';
import { assertDiagnosticEnvelope } from '../../diag/validate';
import { DIAGNOSTIC_CODES } from '../../diag/codes';

function makeSet<T>(arr: T[]): ReadonlySet<T> {
  return new Set(arr);
}

describe('Repair Engine — closed enum rename guard', () => {
  it('chooses lexicographically smallest non-present enum value when guard disabled', () => {
    const res = chooseClosedEnumRenameCandidate('bad', ['z', 'a', 'm'], {
      canonPath: '/obj',
      present: makeSet(['x', 'm']),
      apFalse: false,
      mustCoverGuard: false,
    });
    expect(res.ok).toBe(true);
    expect(res.candidate).toBe('a');
  });

  it('emits MUSTCOVER_INDEX_MISSING when AP:false and guard required but no predicate available', () => {
    const res = chooseClosedEnumRenameCandidate('bad', ['b', 'c'], {
      canonPath: '/obj',
      present: makeSet(['a']),
      apFalse: true,
      // mustCoverGuard defaults to true
    });
    expect(res.ok).toBe(false);
    expect(res.diagnostics?.[0]?.code).toBe(
      DIAGNOSTIC_CODES.MUSTCOVER_INDEX_MISSING
    );
    // Validate envelope shape
    assertDiagnosticEnvelope(res.diagnostics![0]!);
  });

  it('respects must-cover predicate under AP:false', () => {
    const coverageIndex = new Map<string, { has: (n: string) => boolean }>();
    // Only 'c' is in must-cover for this object
    coverageIndex.set('/obj', { has: (n: string) => n === 'c' });
    const res = chooseClosedEnumRenameCandidate('bad', ['b', 'c', 'd'], {
      canonPath: '/obj',
      present: makeSet(['a']),
      apFalse: true,
      coverageIndex,
    });
    expect(res.ok).toBe(true);
    expect(res.candidate).toBe('c');
  });

  it('applies evaluation guard and continues to next candidate; emits REPAIR_EVAL_GUARD_FAIL', () => {
    const res = chooseClosedEnumRenameCandidate('bad', ['a', 'b', 'c'], {
      canonPath: '/obj',
      present: makeSet([]),
      apFalse: false,
      unevaluatedApplies: true,
      isEvaluated: (name) => name !== 'a', // first fails, b passes
    });
    expect(res.ok).toBe(true);
    expect(res.candidate).toBe('b');
    const diag = res.diagnostics?.find(
      (d) => d.code === DIAGNOSTIC_CODES.REPAIR_EVAL_GUARD_FAIL
    );
    expect(diag).toBeTruthy();
    assertDiagnosticEnvelope(diag!);
  });

  it('fails with REPAIR_RENAME_PREFLIGHT_FAIL when no candidate passes evaluation guard', () => {
    const res = chooseClosedEnumRenameCandidate('bad', ['a', 'b'], {
      canonPath: '/obj',
      present: makeSet([]),
      apFalse: false,
      unevaluatedApplies: true,
      isEvaluated: () => false,
    });
    expect(res.ok).toBe(false);
    const diag = res.diagnostics?.find(
      (d) => d.code === DIAGNOSTIC_CODES.REPAIR_RENAME_PREFLIGHT_FAIL
    );
    expect(diag).toBeTruthy();
    assertDiagnosticEnvelope(diag!);
  });

  it('RepairEngine wrapper forwards coverage and precision', () => {
    const coverageIndex = new Map<string, { has: (n: string) => boolean }>();
    coverageIndex.set('/a', { has: (n: string) => n === 'x' });
    const engine = new RepairEngine({ coverageIndex, decimalPrecision: 9 });
    expect(engine.getEpsilon()).toBe('1e-9');
    const res = engine.preflightClosedEnumRename('o', ['x', 'y'], {
      canonPath: '/a',
      present: makeSet([]),
      apFalse: true,
    });
    expect(res.ok).toBe(true);
    expect(res.candidate).toBe('x');
  });
});
