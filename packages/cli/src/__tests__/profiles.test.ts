import { describe, it, expect } from 'vitest';
import type { CliOptions } from '../flags';
import { applyGValidProfileToCliOptions } from '../profiles';

describe('G_valid CLI profiles', () => {
  it('leaves options unchanged for compat profile', () => {
    const base: CliOptions = {
      gvalid: undefined,
      gvalidRelaxRepair: undefined,
    };

    const result = applyGValidProfileToCliOptions(base, 'compat');
    expect(result.gvalid).toBeUndefined();
    expect(result.gvalidRelaxRepair).toBeUndefined();
  });

  it('enables gvalid for strict profile when not explicitly set', () => {
    const base: CliOptions = {};

    const result = applyGValidProfileToCliOptions(base, 'strict');
    expect(result.gvalid).toBe(true);
    expect(result.gvalidRelaxRepair).toBeUndefined();
  });

  it('enables gvalid and gvalidRelaxRepair for relaxed profile', () => {
    const base: CliOptions = {};

    const result = applyGValidProfileToCliOptions(base, 'relaxed');
    expect(result.gvalid).toBe(true);
    expect(result.gvalidRelaxRepair).toBe(true);
  });

  it('does not override explicit gvalid/gvalidRelaxRepair flags', () => {
    const base: CliOptions = {
      gvalid: false,
      gvalidRelaxRepair: false,
    };

    const result = applyGValidProfileToCliOptions(base, 'relaxed');
    expect(result.gvalid).toBe(false);
    expect(result.gvalidRelaxRepair).toBe(false);
  });

  it('throws on invalid profile value', () => {
    const base: CliOptions = {};
    expect(() =>
      applyGValidProfileToCliOptions(base, 'unknown-profile')
    ).toThrow(/Invalid --gvalid-profile value/);
  });
});
