import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import { createSourceAjv } from '../../util/ajv-source';
import { createPlanningAjv } from '../../util/ajv-planning';
import {
  AjvFlagsMismatchError,
  checkAjvStartupParity,
} from '../../util/ajv-gate';
import Ajv2020 from 'ajv/dist/2020';

describe('AJV startup parity gate', () => {
  it('passes when factories use matching required flags', () => {
    const source = createSourceAjv({
      dialect: 'draft-07',
      validateFormats: false,
    });
    const planning = createPlanningAjv({
      validateFormats: false,
      allowUnionTypes: true,
    });

    expect(() =>
      checkAjvStartupParity(source, planning, {
        planningCompilesCanonical2020: true,
        validateFormats: false,
        sourceClass: 'Ajv',
      })
    ).not.toThrow();
  });

  it('fails when validateFormats differ across instances', () => {
    const source = createSourceAjv({
      dialect: 'draft-07',
      validateFormats: false,
    });
    const planning = createPlanningAjv({
      validateFormats: true,
      allowUnionTypes: true,
    });

    try {
      checkAjvStartupParity(source, planning, {
        planningCompilesCanonical2020: true,
        validateFormats: false,
        sourceClass: 'Ajv',
      });
      throw new Error('expected AjvFlagsMismatchError');
    } catch (e: any) {
      expect(e).toBeInstanceOf(AjvFlagsMismatchError);
      expect(
        e.details.diffs.some((d: any) => d.flag.includes('validateFormats'))
      ).toBe(true);
    }
  });

  it('fails when unicodeRegExp is disabled on any instance', () => {
    const source = createSourceAjv({
      dialect: 'draft-07',
      validateFormats: false,
    });
    const planning = new Ajv2020({
      unicodeRegExp: false,
      strictSchema: true,
      strictTypes: true,
      allErrors: false,
      coerceTypes: false,
    }) as any;
    (planning as { __fd_ajvClass?: string }).__fd_ajvClass = 'Ajv2020';

    try {
      checkAjvStartupParity(source as any, planning as any, {
        planningCompilesCanonical2020: true,
        validateFormats: false,
        sourceClass: 'Ajv',
      });
      throw new Error('expected AjvFlagsMismatchError');
    } catch (e: any) {
      expect(e).toBeInstanceOf(AjvFlagsMismatchError);
      expect(e.details.diffs.some((d: any) => d.flag === 'unicodeRegExp')).toBe(
        true
      );
    }
  });

  it('fails when source strictTypes deviates from the tolerant profile', () => {
    const source = new Ajv({
      strictSchema: false,
      strictTypes: true,
      allowUnionTypes: true,
      unicodeRegExp: true,
      useDefaults: false,
      removeAdditional: false,
      coerceTypes: false,
      allErrors: false,
      validateFormats: false,
    }) as any;
    (source as { __fd_ajvClass?: string }).__fd_ajvClass = 'Ajv';

    const planning = createPlanningAjv({
      validateFormats: false,
      allowUnionTypes: true,
    });

    try {
      checkAjvStartupParity(source as any, planning as any, {
        planningCompilesCanonical2020: true,
        validateFormats: false,
        sourceClass: 'Ajv',
      });
      throw new Error('expected AjvFlagsMismatchError');
    } catch (e: any) {
      expect(e).toBeInstanceOf(AjvFlagsMismatchError);
      expect(
        e.details.diffs.some(
          (d: any) =>
            String(d.flag).includes('strictTypes') &&
            String(d.flag).includes('source')
        )
      ).toBe(true);
    }
  });

  it('enforces multipleOfPrecision alignment when provided', () => {
    const source = createSourceAjv({
      dialect: 'draft-07',
      validateFormats: false,
      multipleOfPrecision: 12,
    });
    const planning = createPlanningAjv({
      validateFormats: false,
      allowUnionTypes: true,
      multipleOfPrecision: 9,
    });

    try {
      checkAjvStartupParity(source, planning, {
        planningCompilesCanonical2020: true,
        validateFormats: false,
        multipleOfPrecision: 12,
        sourceClass: 'Ajv',
      });
      throw new Error('expected AjvFlagsMismatchError');
    } catch (e: any) {
      expect(e).toBeInstanceOf(AjvFlagsMismatchError);
      const diffFlags = e.details.diffs.map((d: any) => d.flag);
      expect(
        diffFlags.some((f: string) => f.startsWith('multipleOfPrecision'))
      ).toBe(true);
    }
  });

  it('enforces formats plugin parity when validateFormats:true', () => {
    const source = createSourceAjv({
      dialect: 'draft-07',
      validateFormats: true,
    });
    // Create planning Ajv without installing ajv-formats to simulate mismatch
    // and mark class for the gate.
    const planning = new Ajv2020({
      strictSchema: true,
      strictTypes: true,
      allErrors: false,
      unicodeRegExp: true,
      coerceTypes: false,
      validateFormats: true,
    }) as any;
    (planning as { __fd_ajvClass?: string }).__fd_ajvClass = 'Ajv2020';

    try {
      checkAjvStartupParity(source, planning, {
        planningCompilesCanonical2020: true,
        validateFormats: true,
        sourceClass: 'Ajv',
      });
      throw new Error('expected AjvFlagsMismatchError');
    } catch (e: any) {
      expect(e).toBeInstanceOf(AjvFlagsMismatchError);
      const hasFormatsDiff = e.details.diffs.some((d: any) =>
        String(d.flag).includes('formatsPlugin')
      );
      expect(hasFormatsDiff).toBe(true);
    }
  });

  it('maps drafts to the correct Ajv class (source) and requires Ajv2020 for planning', () => {
    // Source for 2019-09 should mark Ajv2019
    const source2019 = createSourceAjv({
      dialect: '2019-09',
      validateFormats: false,
    });
    // Planning must be Ajv2020
    const planning = createPlanningAjv({
      validateFormats: false,
      allowUnionTypes: true,
    });

    expect(() =>
      checkAjvStartupParity(source2019, planning, {
        planningCompilesCanonical2020: true,
        validateFormats: false,
        sourceClass: 'Ajv2019',
      })
    ).not.toThrow();
  });

  it('integration: successfully compiles a simple schema with both instances (no externals)', () => {
    const simple = { type: 'string' } as const;
    const source = createSourceAjv({
      dialect: 'draft-07',
      validateFormats: false,
    });
    const planning = createPlanningAjv({
      validateFormats: false,
      allowUnionTypes: true,
    });

    const sValidate = source.compile(simple as any);
    const pValidate = planning.compile(simple as any);
    expect(typeof sValidate).toBe('function');
    expect(typeof pValidate).toBe('function');
  });
});
