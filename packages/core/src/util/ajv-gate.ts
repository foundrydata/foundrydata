/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
import type Ajv from 'ajv';
import { createRequire } from 'node:module';

import { extractAjvFlags, type ExtractedAjvFlags } from './ajv-source.js';

const requireJson = createRequire(import.meta.url);
const ajvPkg = requireJson('ajv/package.json') as { version?: string };

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

  let sourceFailed = false;
  let planningFailed = false;
  const recordDiff = (
    diff: AjvGateDiff,
    opts: { source?: boolean; planning?: boolean } = {}
  ): void => {
    diffs.push(diff);
    if (opts.source === true) {
      sourceFailed = true;
    }
    if (opts.planning === true) {
      planningFailed = true;
    }
  };

  const sFlags = extractAjvFlags(sourceAjv);
  const pFlags = extractAjvFlags(planningAjv);

  const expectedValidateFormats = Boolean(expect.validateFormats);
  const sValidateFormats = Boolean(sFlags.validateFormats);
  const pValidateFormats = Boolean(pFlags.validateFormats);

  // Both must enable unicodeRegExp
  if (sFlags.unicodeRegExp !== true) {
    recordDiff(
      {
        flag: 'unicodeRegExp',
        expected: true,
        actual: sFlags.unicodeRegExp,
      },
      { source: true }
    );
  }
  if (pFlags.unicodeRegExp !== true) {
    recordDiff(
      {
        flag: 'unicodeRegExp',
        expected: true,
        actual: pFlags.unicodeRegExp,
      },
      { planning: true }
    );
  }

  // validateFormats identical on both
  if (sValidateFormats !== pValidateFormats) {
    recordDiff(
      {
        flag: 'validateFormats',
        expected: sFlags.validateFormats,
        actual: pFlags.validateFormats,
      },
      {
        source: sValidateFormats !== expectedValidateFormats,
        planning: pValidateFormats !== expectedValidateFormats,
      }
    );
  }
  if (sValidateFormats !== expectedValidateFormats) {
    recordDiff(
      {
        flag: 'validateFormatsPolicy',
        expected: expect.validateFormats,
        actual: sFlags.validateFormats,
      },
      { source: true }
    );
  }
  if (pValidateFormats !== expectedValidateFormats) {
    recordDiff(
      {
        flag: 'validateFormatsPolicy(planning)',
        expected: expect.validateFormats,
        actual: pFlags.validateFormats,
      },
      { planning: true }
    );
  }

  // formats plugin parity (SPEC §13 startup-config-check)
  // If validateFormats:true on either instance, both must have an equivalent set
  // of active validators (e.g., via ajv-formats). Factories mark presence on
  // __fd_formatsPlugin; use it to verify parity and presence.
  const sFormatsPlugin =
    (sourceAjv as AjvWithMarkers).__fd_formatsPlugin === true;
  const pFormatsPlugin =
    (planningAjv as AjvWithMarkers).__fd_formatsPlugin === true;
  if (sValidateFormats || pValidateFormats) {
    // Presence on each instance when it claims validateFormats:true
    if (sValidateFormats && !sFormatsPlugin) {
      recordDiff(
        {
          flag: 'formatsPlugin(source)',
          expected: true,
          actual: sFormatsPlugin,
        },
        { source: true }
      );
    }
    if (pValidateFormats && !pFormatsPlugin) {
      recordDiff(
        {
          flag: 'formatsPlugin(planning)',
          expected: true,
          actual: pFormatsPlugin,
        },
        { planning: true }
      );
    }
    // Parity across instances when format validation is active on both
    if (sValidateFormats && pValidateFormats) {
      if (sFormatsPlugin !== pFormatsPlugin) {
        recordDiff(
          {
            flag: 'formatsPlugin(parity)',
            expected: true,
            actual: false,
          },
          { source: !sFormatsPlugin, planning: !pFormatsPlugin }
        );
      }
    }
  }

  // allowUnionTypes policy: enabled on planning when compiling union-typed views (we require true by default)
  if (expect.planningCompilesCanonical2020 && pFlags.allowUnionTypes !== true) {
    recordDiff(
      {
        flag: 'allowUnionTypes(planning)',
        expected: true,
        actual: pFlags.allowUnionTypes,
      },
      { planning: true }
    );
  }

  // strictTypes policy: tolerant source vs strict planning (§13)
  if (sFlags.strictTypes !== false) {
    recordDiff(
      {
        flag: 'strictTypes(source)',
        expected: false,
        actual: sFlags.strictTypes,
      },
      { source: true }
    );
  }
  if (expect.planningCompilesCanonical2020 && pFlags.strictTypes !== true) {
    recordDiff(
      {
        flag: 'strictTypes(planning)',
        expected: true,
        actual: pFlags.strictTypes,
      },
      { planning: true }
    );
  }

  if (sFlags.strictSchema !== false) {
    recordDiff(
      {
        flag: 'strictSchema(source)',
        expected: false,
        actual: sFlags.strictSchema,
      },
      { source: true }
    );
  }
  if (expect.planningCompilesCanonical2020 && pFlags.strictSchema !== true) {
    recordDiff(
      {
        flag: 'strictSchema(planning)',
        expected: true,
        actual: pFlags.strictSchema,
      },
      { planning: true }
    );
  }

  // discriminator parity
  if (expect.discriminator !== undefined) {
    if (Boolean(sFlags.discriminator) !== Boolean(expect.discriminator)) {
      recordDiff(
        {
          flag: 'discriminator(source)',
          expected: expect.discriminator,
          actual: sFlags.discriminator,
        },
        { source: true }
      );
    }
    if (Boolean(pFlags.discriminator) !== Boolean(expect.discriminator)) {
      recordDiff(
        {
          flag: 'discriminator(planning)',
          expected: expect.discriminator,
          actual: pFlags.discriminator,
        },
        { planning: true }
      );
    }
  }

  // multipleOfPrecision alignment when provided
  if (expect.multipleOfPrecision !== undefined) {
    if (sFlags.multipleOfPrecision !== expect.multipleOfPrecision) {
      recordDiff(
        {
          flag: 'multipleOfPrecision(source)',
          expected: expect.multipleOfPrecision,
          actual: sFlags.multipleOfPrecision,
        },
        { source: true }
      );
    }
    if (pFlags.multipleOfPrecision !== expect.multipleOfPrecision) {
      recordDiff(
        {
          flag: 'multipleOfPrecision(planning)',
          expected: expect.multipleOfPrecision,
          actual: pFlags.multipleOfPrecision,
        },
        { planning: true }
      );
    }
  }

  // Ajv class/dialect expectations (check markers set by factories)
  const sClass = (sourceAjv as AjvWithMarkers).__fd_ajvClass;
  const pClass = (planningAjv as AjvWithMarkers).__fd_ajvClass;
  if (sClass !== expect.sourceClass) {
    recordDiff(
      {
        flag: 'dialectClass(source)',
        expected: expect.sourceClass,
        actual: sClass,
      },
      { source: true }
    );
  }
  if (expect.planningCompilesCanonical2020 && pClass !== 'Ajv2020') {
    recordDiff(
      {
        flag: 'dialectClass(planning)',
        expected: 'Ajv2020',
        actual: pClass,
      },
      { planning: true }
    );
  }

  if (diffs.length > 0) {
    const instance: AjvGateFailureDetails['instance'] =
      sourceFailed && !planningFailed
        ? 'source'
        : planningFailed && !sourceFailed
          ? 'planning'
          : 'both';
    const details: AjvGateFailureDetails = {
      instance,
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
