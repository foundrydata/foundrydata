import { describe, it, expect } from 'vitest';
import type { CliOptions } from '../flags';
import { applyGValidProfileToCliOptions } from '../profiles';

describe('G_valid CLI profiles', () => {
  it('enables gvalid by default when no profile is provided', () => {
    const base: CliOptions = {};

    const result = applyGValidProfileToCliOptions(base, undefined);
    expect(result.gvalid).toBe(true);
    expect(result.gvalidRelaxRepair).toBeUndefined();
  });

  it('disables gvalid when compat profile is requested', () => {
    const base: CliOptions = {
      gvalidRelaxRepair: undefined,
    };

    const result = applyGValidProfileToCliOptions(base, 'compat');
    expect(result.gvalid).toBe(false);
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
