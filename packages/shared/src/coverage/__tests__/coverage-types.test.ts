import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  CoverageDimension,
  CoverageTarget,
  DiagnosticCoverageTargetKind,
} from '../index';
import {
  COVERAGE_DIMENSIONS,
  COVERAGE_STATUSES,
  DIAGNOSTIC_TARGET_KINDS,
} from '../index';

describe('coverage types (shared)', () => {
  it('exposes the expected coverage dimensions', () => {
    expect(COVERAGE_DIMENSIONS).toEqual([
      'structure',
      'branches',
      'enum',
      'boundaries',
      'operations',
    ]);

    expectTypeOf<CoverageDimension>().toEqualTypeOf<
      'structure' | 'branches' | 'enum' | 'boundaries' | 'operations'
    >();
  });

  it('exposes the expected statuses', () => {
    expect(COVERAGE_STATUSES).toEqual(['active', 'unreachable', 'deprecated']);
  });

  it('treats SCHEMA_REUSED_COVERED as a diagnostic-only kind', () => {
    expect(DIAGNOSTIC_TARGET_KINDS).toEqual(['SCHEMA_REUSED_COVERED']);

    expectTypeOf<DiagnosticCoverageTargetKind>().toEqualTypeOf<'SCHEMA_REUSED_COVERED'>();

    type SchemaReusedDeprecated = {
      id: string;
      dimension: CoverageDimension;
      kind: 'SCHEMA_REUSED_COVERED';
      canonPath: string;
      status: 'deprecated';
    };

    type SchemaReusedActive = Omit<SchemaReusedDeprecated, 'status'> & {
      status: 'active';
    };

    expectTypeOf<SchemaReusedDeprecated>().toMatchTypeOf<CoverageTarget>();
    expectTypeOf<SchemaReusedActive>().not.toMatchTypeOf<CoverageTarget>();
  });
});
