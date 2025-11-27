import type { CoverageTarget } from '@foundrydata/shared';
import { structuralHash } from '../util/struct-hash.js';

export interface CoverageTargetIdContext {
  /**
   * FoundryData engine major version.
   */
  engineMajorVersion: number;
  /**
   * Coverage-report format major version.
   */
  reportFormatMajorVersion: number;
}

export const DEFAULT_COVERAGE_REPORT_FORMAT_MAJOR = 1;

export function parseEngineMajorVersion(engineVersion: string): number {
  const [majorRaw] = engineVersion.split('.');
  const major = Number(majorRaw);
  if (!Number.isInteger(major) || major < 0) {
    throw new Error(
      `Invalid engine version "${engineVersion}". Expected MAJOR.MINOR.PATCH.`
    );
  }
  return major;
}

export function createCoverageTargetIdContext(params: {
  engineVersion: string;
  reportFormatMajorVersion?: number;
}): CoverageTargetIdContext {
  return {
    engineMajorVersion: parseEngineMajorVersion(params.engineVersion),
    reportFormatMajorVersion:
      params.reportFormatMajorVersion ?? DEFAULT_COVERAGE_REPORT_FORMAT_MAJOR,
  };
}

function buildCanonicalIdPayload(
  target: CoverageTarget,
  context: CoverageTargetIdContext
): unknown {
  return {
    v: 1,
    engineMajor: context.engineMajorVersion,
    reportMajor: context.reportFormatMajorVersion,
    dimension: target.dimension,
    kind: target.kind,
    canonPath: target.canonPath,
    operationKey: target.operationKey ?? null,
    params: target.params ?? null,
  };
}

export function computeCoverageTargetId(
  target: CoverageTarget,
  context: CoverageTargetIdContext
): string {
  const payload = buildCanonicalIdPayload(target, context);
  const { digest } = structuralHash(payload);
  return `cov:${context.engineMajorVersion}:${context.reportFormatMajorVersion}:${digest}`;
}
