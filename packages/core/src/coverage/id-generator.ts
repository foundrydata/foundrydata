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
