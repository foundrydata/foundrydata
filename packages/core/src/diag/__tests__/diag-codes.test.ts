import { describe, expect, it } from 'vitest';

import {
  DIAGNOSTIC_CODES,
  DIAGNOSTIC_PHASES,
  getAllowedDiagnosticPhases,
} from '../codes.js';
import { assertDiagnosticEnvelope } from '../validate.js';

describe('Repair philosophy diagnostics', () => {
  it('REPAIR_TIER_DISABLED is registered with phase repair and valid payload', () => {
    const phases = getAllowedDiagnosticPhases(
      DIAGNOSTIC_CODES.REPAIR_TIER_DISABLED
    );
    expect(phases).toBeDefined();
    expect(phases?.has(DIAGNOSTIC_PHASES.REPAIR)).toBe(true);

    expect(() =>
      assertDiagnosticEnvelope({
        code: DIAGNOSTIC_CODES.REPAIR_TIER_DISABLED,
        canonPath: '/properties/foo/type',
        phase: DIAGNOSTIC_PHASES.REPAIR,
        details: {
          keyword: 'type',
          requestedTier: 2,
          allowedMaxTier: 1,
          reason: 'g_valid',
        },
      })
    ).not.toThrow();
  });

  it('REPAIR_REVERTED_NO_PROGRESS is registered with phase repair and valid payload', () => {
    const phases = getAllowedDiagnosticPhases(
      DIAGNOSTIC_CODES.REPAIR_REVERTED_NO_PROGRESS
    );
    expect(phases).toBeDefined();
    expect(phases?.has(DIAGNOSTIC_PHASES.REPAIR)).toBe(true);

    expect(() =>
      assertDiagnosticEnvelope({
        code: DIAGNOSTIC_CODES.REPAIR_REVERTED_NO_PROGRESS,
        canonPath: '/properties/foo/type',
        phase: DIAGNOSTIC_PHASES.REPAIR,
        details: {
          keyword: 'type',
          scoreBefore: 3,
          scoreAfter: 3,
        },
      })
    ).not.toThrow();
  });

  it('rejects invalid payloads for Repair philosophy diagnostics', () => {
    expect(() =>
      assertDiagnosticEnvelope({
        code: DIAGNOSTIC_CODES.REPAIR_TIER_DISABLED,
        canonPath: '/properties/foo/type',
        phase: DIAGNOSTIC_PHASES.REPAIR,
        // missing required fields
        details: {
          keyword: 'type',
        },
      })
    ).toThrow(/expected shape/);

    expect(() =>
      assertDiagnosticEnvelope({
        code: DIAGNOSTIC_CODES.REPAIR_REVERTED_NO_PROGRESS,
        canonPath: '/properties/foo/type',
        phase: DIAGNOSTIC_PHASES.REPAIR,
        // wrong types
        details: {
          keyword: 'type',
          scoreBefore: '3',
          scoreAfter: 2,
        },
      })
    ).toThrow(/expected shape/);
  });
});
