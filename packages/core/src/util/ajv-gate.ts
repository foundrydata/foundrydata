/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
import type Ajv from 'ajv';
import ajvPkg from 'ajv/package.json';

import { extractAjvFlags, type ExtractedAjvFlags } from './ajv-source';

export interface AjvGateDiff {
  flag: string;
  expected: unknown;
  actual: unknown;
}

export interface AjvGateFailureDetails {
  instance: 'source' | 'planning' | 'both';
  diffs: AjvGateDiff[];
  ajvMajor: number;
  sourceFlags?: Record<string, unknown>;
  planningFlags?: Record<string, unknown>;
}

export class AjvFlagsMismatchError extends Error {
  public readonly details: AjvGateFailureDetails;
  constructor(message: string, details: AjvGateFailureDetails) {
    super(message);
    this.name = 'AjvFlagsMismatchError';
    this.details = details;
  }
}

export interface StartupGateExpectations {
  // Whether planning compiles canonical 2020-12-like view
  planningCompilesCanonical2020: boolean;
  // validateFormats must be identical across both instances
  validateFormats: boolean;
  // If true, both instances must have discriminator enabled
  discriminator?: boolean;
  // Expected multipleOfPrecision when rational fallback is decimal/float
  multipleOfPrecision?: number;
  // Expected Source Ajv class label
  sourceClass: 'Ajv' | 'Ajv2019' | 'Ajv2020' | 'ajv-draft-04';
}

type AjvWithMarkers = Ajv & {
  __fd_formatsPlugin?: boolean;
  __fd_ajvClass?:
    | 'Ajv'
    | 'Ajv2019'
    | 'Ajv2020'
    | 'ajv-draft-04'
    | string
    | undefined;
};

/**
 * Verify AJV startup parity as mandated by the SPEC startup gate.
 * Throws AjvFlagsMismatchError when violations are detected.
 */
export function checkAjvStartupParity(
  sourceAjv: Ajv,
  planningAjv: Ajv,
  expect: StartupGateExpectations
): void {
  const diffs: AjvGateDiff[] = [];

  const sFlags = extractAjvFlags(sourceAjv);
  const pFlags = extractAjvFlags(planningAjv);

  // Both must enable unicodeRegExp
  if (sFlags.unicodeRegExp !== true) {
    diffs.push({
      flag: 'unicodeRegExp',
      expected: true,
      actual: sFlags.unicodeRegExp,
    });
  }
  if (pFlags.unicodeRegExp !== true) {
    diffs.push({
      flag: 'unicodeRegExp',
      expected: true,
      actual: pFlags.unicodeRegExp,
    });
  }

  // validateFormats identical on both
  if (Boolean(sFlags.validateFormats) !== Boolean(pFlags.validateFormats)) {
    diffs.push({
      flag: 'validateFormats',
      expected: sFlags.validateFormats,
      actual: pFlags.validateFormats,
    });
  }
  if (Boolean(sFlags.validateFormats) !== Boolean(expect.validateFormats)) {
    diffs.push({
      flag: 'validateFormatsPolicy',
      expected: expect.validateFormats,
      actual: sFlags.validateFormats,
    });
  }

  // allowUnionTypes policy: enabled on planning when compiling union-typed views (we require true by default)
  if (expect.planningCompilesCanonical2020 && pFlags.allowUnionTypes !== true) {
    diffs.push({
      flag: 'allowUnionTypes(planning)',
      expected: true,
      actual: pFlags.allowUnionTypes,
    });
  }

  // discriminator parity
  if (expect.discriminator !== undefined) {
    if (Boolean(sFlags.discriminator) !== Boolean(expect.discriminator)) {
      diffs.push({
        flag: 'discriminator(source)',
        expected: expect.discriminator,
        actual: sFlags.discriminator,
      });
    }
    if (Boolean(pFlags.discriminator) !== Boolean(expect.discriminator)) {
      diffs.push({
        flag: 'discriminator(planning)',
        expected: expect.discriminator,
        actual: pFlags.discriminator,
      });
    }
  }

  // multipleOfPrecision alignment when provided
  if (expect.multipleOfPrecision !== undefined) {
    if (sFlags.multipleOfPrecision !== expect.multipleOfPrecision) {
      diffs.push({
        flag: 'multipleOfPrecision(source)',
        expected: expect.multipleOfPrecision,
        actual: sFlags.multipleOfPrecision,
      });
    }
    if (pFlags.multipleOfPrecision !== expect.multipleOfPrecision) {
      diffs.push({
        flag: 'multipleOfPrecision(planning)',
        expected: expect.multipleOfPrecision,
        actual: pFlags.multipleOfPrecision,
      });
    }
  }

  // Ajv class/dialect expectations (check markers set by factories)
  const sClass = (sourceAjv as AjvWithMarkers).__fd_ajvClass;
  const pClass = (planningAjv as AjvWithMarkers).__fd_ajvClass;
  if (sClass !== expect.sourceClass) {
    diffs.push({
      flag: 'dialectClass(source)',
      expected: expect.sourceClass,
      actual: sClass,
    });
  }
  if (expect.planningCompilesCanonical2020 && pClass !== 'Ajv2020') {
    diffs.push({
      flag: 'dialectClass(planning)',
      expected: 'Ajv2020',
      actual: pClass,
    });
  }

  if (diffs.length > 0) {
    const details: AjvGateFailureDetails = {
      instance: 'both',
      diffs,
      ajvMajor: getAjvMajorVersion(),
      sourceFlags: normalizeFlagsForReport(sFlags),
      planningFlags: normalizeFlagsForReport(pFlags),
    };
    throw new AjvFlagsMismatchError('AJV_FLAGS_MISMATCH', details);
  }
}

function getAjvMajorVersion(): number {
  const v = String((ajvPkg as { version?: string }).version ?? '8');
  const major = parseInt(v.split('.')[0]!, 10);
  return Number.isNaN(major) ? 8 : major;
}

function normalizeFlagsForReport(
  flags: ExtractedAjvFlags
): Record<string, unknown> {
  return { ...flags } as Record<string, unknown>;
}
