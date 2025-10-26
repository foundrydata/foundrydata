import { createRequire } from 'node:module';
import Ajv, { type Options as AjvOptions } from 'ajv';
import Ajv2019 from 'ajv/dist/2019.js';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  resolveOptions,
  type PlanOptions,
  type ResolvedOptions,
} from '../types/options.js';

export type JsonSchemaDialect = 'draft-04' | 'draft-07' | '2019-09' | '2020-12';

const requireForDraft = createRequire(import.meta.url);

export interface SourceAjvFactoryOptions {
  dialect: JsonSchemaDialect;
  validateFormats?: boolean;
  multipleOfPrecision?: number;
  discriminator?: boolean;
}

/**
 * Create an AJV instance for validating against the original source schema
 * using flags required for Source compilation.
 */
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

export function createSourceAjv(
  options: SourceAjvFactoryOptions,
  planOptions?: Partial<PlanOptions>
): Ajv {
  const resolved: ResolvedOptions = resolveOptions(planOptions);

  const baseFlags: AjvOptions = {
    // Source (original schema) flags (REFONLY::{"anchors":["spec://§13#source-ajv"]})
    strictSchema: false,
    allowUnionTypes: true,
    unicodeRegExp: true,
    useDefaults: false,
    removeAdditional: false,
    coerceTypes: false,
    allErrors: false,
    validateFormats: options.validateFormats ?? false,
    discriminator: options.discriminator ?? false,
    // Align epsilon with rational.decimalPrecision when relevant
    multipleOfPrecision:
      options.multipleOfPrecision ??
      (resolved.rational.fallback === 'decimal' ||
      resolved.rational.fallback === 'float'
        ? resolved.rational.decimalPrecision
        : undefined),
  } as AjvOptions;

  const ajv = createAjvByDialect(options.dialect, baseFlags) as AjvWithMarkers;

  // If formats validation is enabled, add ajv-formats plugin
  if (baseFlags.validateFormats) {
    addFormats(ajv as Ajv);
    // mark formats plugin presence for parity checks
    ajv.__fd_formatsPlugin = true;
  }

  // Attach a stable marker with the chosen class/dialect for parity checks
  ajv.__fd_ajvClass = getAjvClassLabel(options.dialect);
  return ajv as Ajv;
}

export function createRepairOnlyValidatorAjv(
  options: SourceAjvFactoryOptions,
  planOptions?: Partial<PlanOptions>
): Ajv {
  const ajv = createSourceAjv(options, planOptions);
  // Toggle allErrors:true for repair-only use (does not affect startup gate)
  // Ajv does not support toggling after creation; recreate with flag
  const flags = extractAjvFlags(ajv);
  const dialect = options.dialect;
  const ajv2 = createAjvByDialect(dialect, {
    ...flags,
    allErrors: true,
  } as AjvOptions);
  if (flags.validateFormats) {
    addFormats(ajv2);
    (ajv2 as AjvWithMarkers).__fd_formatsPlugin = true;
  }
  (ajv2 as AjvWithMarkers).__fd_ajvClass = getAjvClassLabel(dialect);
  return ajv2;
}

function createAjvByDialect(
  dialect: JsonSchemaDialect,
  flags: AjvOptions
): Ajv {
  switch (dialect) {
    case 'draft-07':
      return new Ajv(flags);
    case '2019-09':
      return new Ajv2019(flags) as unknown as Ajv;
    case '2020-12':
      return new Ajv2020(flags) as unknown as Ajv;
    case 'draft-04': {
      // ajv-draft-04 is optional; resolve lazily via createRequire for ESM compatibility
      const AjvDraft04 = requireForDraft('ajv-draft-04');
      return new AjvDraft04(flags) as unknown as Ajv;
    }
    default:
      return new Ajv(flags);
  }
}

export function getAjvClassLabel(
  dialect: JsonSchemaDialect
): 'Ajv' | 'Ajv2019' | 'Ajv2020' | 'ajv-draft-04' {
  switch (dialect) {
    case 'draft-07':
      return 'Ajv';
    case '2019-09':
      return 'Ajv2019';
    case '2020-12':
      return 'Ajv2020';
    case 'draft-04':
      return 'ajv-draft-04';
  }
}

export type ExtractedAjvFlags = {
  validateFormats?: boolean;
  allowUnionTypes?: boolean;
  unicodeRegExp?: boolean;
  coerceTypes?: boolean | 'array';
  strictTypes?: boolean;
  strictSchema?: boolean;
  removeAdditional?: boolean | 'all' | 'failing';
  useDefaults?: boolean | 'empty' | 'shared';
  allErrors?: boolean;
  multipleOfPrecision?: number;
  discriminator?: boolean;
};

export function extractAjvFlags(ajv: Ajv): ExtractedAjvFlags {
  // Ajv exposes options on .opts
  type AjvInternal = Ajv & { opts?: Record<string, unknown> };
  const opts = ((ajv as AjvInternal).opts ?? {}) as Record<string, unknown>;
  return {
    validateFormats: opts.validateFormats as boolean | undefined,
    allowUnionTypes: opts.allowUnionTypes as boolean | undefined,
    unicodeRegExp: opts.unicodeRegExp as boolean | undefined,
    coerceTypes: opts.coerceTypes as boolean | 'array' | undefined,
    strictTypes: opts.strictTypes as boolean | undefined,
    strictSchema: opts.strictSchema as boolean | undefined,
    removeAdditional: opts.removeAdditional as
      | boolean
      | 'all'
      | 'failing'
      | undefined,
    useDefaults: opts.useDefaults as boolean | 'empty' | 'shared' | undefined,
    allErrors: opts.allErrors as boolean | undefined,
    multipleOfPrecision: opts.multipleOfPrecision as number | undefined,
    discriminator: opts.discriminator as boolean | undefined,
  };
}
