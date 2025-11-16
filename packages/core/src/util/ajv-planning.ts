import Ajv, { type Options as AjvOptions } from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { resolveOptions, type PlanOptions } from '../types/options.js';
import { extractAjvFlags } from './ajv-source.js';

export interface PlanningAjvFactoryOptions {
  validateFormats?: boolean;
  allowUnionTypes?: boolean; // enable when compiling union-typed canonical views
  discriminator?: boolean;
  multipleOfPrecision?: number;
}

/**
 * Create an AJV instance for planning/generation compiles against the
 * internal canonical 2020-12-like view.
 */
export function createPlanningAjv(
  options: PlanningAjvFactoryOptions = {},
  planOptions?: Partial<PlanOptions>
): Ajv {
  const resolved = resolveOptions(planOptions);

  const flags: AjvOptions = {
    // Planning/Generation flags (REFONLY::{"anchors":["spec://§13#planning-ajv"]})
    strictSchema: true,
    strictTypes: true,
    allErrors: false,
    unicodeRegExp: true,
    coerceTypes: false,
    allowUnionTypes: options.allowUnionTypes ?? true,
    validateFormats: options.validateFormats ?? false,
    discriminator: options.discriminator ?? false,
    multipleOfPrecision:
      options.multipleOfPrecision ??
      (resolved.rational.fallback === 'decimal' ||
      resolved.rational.fallback === 'float'
        ? resolved.rational.decimalPrecision
        : undefined),
  } as AjvOptions;

  type AjvWithMarkers = Ajv & {
    __fd_formatsPlugin?: boolean;
    __fd_ajvClass?: string;
  };
  const ajv = new Ajv2020(flags) as unknown as AjvWithMarkers;
  if (flags.validateFormats) {
    addFormats(ajv as unknown as Ajv);
    ajv.__fd_formatsPlugin = true;
  }
  ajv.__fd_ajvClass = 'Ajv2020';
  return ajv as unknown as Ajv;
}

export function clonePlanningAjvWith(
  source: Ajv,
  overrides: Partial<AjvOptions>
): Ajv {
  const base = extractAjvFlags(source);
  const flags: AjvOptions = {
    validateFormats: base.validateFormats,
    allowUnionTypes: base.allowUnionTypes,
    unicodeRegExp: base.unicodeRegExp,
    coerceTypes: base.coerceTypes,
    strictTypes: base.strictTypes,
    strictSchema: base.strictSchema,
    removeAdditional: base.removeAdditional,
    useDefaults: base.useDefaults,
    allErrors: base.allErrors,
    multipleOfPrecision: base.multipleOfPrecision,
    discriminator: base.discriminator,
    ...overrides,
  } as AjvOptions;
  type AjvWithMarkers = Ajv & {
    __fd_formatsPlugin?: boolean;
    __fd_ajvClass?: string;
  };
  const ajv = new Ajv2020(flags) as unknown as AjvWithMarkers;
  if (flags.validateFormats) {
    addFormats(ajv as unknown as Ajv);
    ajv.__fd_formatsPlugin = true;
  }
  ajv.__fd_ajvClass = 'Ajv2020';
  return ajv as unknown as Ajv;
}
