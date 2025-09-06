import { describe, it, expect } from 'vitest';
import {
  LIMITATIONS_REGISTRY,
  getLimitation,
  isSupported,
  compareVersions,
  enrichErrorWithLimitation,
  CURRENT_VERSION,
} from '../../errors/limitations';
import { ErrorCode } from '../../errors/codes';
import { FoundryError } from '../../types/errors';

describe('Limitations Registry', () => {
  it('getLimitation returns correct data for known keys', () => {
    const nested = getLimitation('nestedObjects');
    const regex = getLimitation('regexPatterns');
    const comp = getLimitation('schemaComposition');

    expect(nested?.errorCode).toBe(ErrorCode.NESTED_OBJECTS_NOT_SUPPORTED);
    expect(regex?.errorCode).toBe(ErrorCode.REGEX_PATTERNS_NOT_SUPPORTED);
    expect(comp?.errorCode).toBe(ErrorCode.SCHEMA_COMPOSITION_NOT_SUPPORTED);
  });

  it('unknown limitation returns null', () => {
    expect(getLimitation('nope')).toBeNull();
  });

  it('compareVersions handles semver and v-prefix correctly', () => {
    expect(compareVersions('0.1.0', '0.2.0')).toBeLessThan(0);
    expect(compareVersions('v0.2.0', '0.2.0')).toBe(0);
    expect(compareVersions('0.3', '0.3.0')).toBe(0);
    expect(compareVersions('0.3.1', '0.3.0')).toBeGreaterThan(0);
  });

  it('isSupported correctly compares against availableIn', () => {
    expect(isSupported('nestedObjects', '0.2.0')).toBe(false);
    expect(isSupported('nestedObjects', 'v0.3')).toBe(true);
    expect(isSupported('nestedObjects', '0.3.1')).toBe(true);
    // CURRENT_VERSION is MVP (0.1.0) -> not supported for nestedObjects(0.3.0)
    expect(isSupported('nestedObjects', CURRENT_VERSION)).toBe(false);
    // regexPatterns available at 0.2.0
    expect(isSupported('regexPatterns', '0.2.0')).toBe(true);
  });

  it('enrichErrorWithLimitation adds context, documentation and suggestions', () => {
    const base = new (class extends FoundryError {})({
      message: 'Nested objects are not supported',
      errorCode: ErrorCode.NESTED_OBJECTS_NOT_SUPPORTED,
    });
    const enriched = enrichErrorWithLimitation(base, 'nestedObjects');

    expect(enriched.limitationKey).toBe('nestedObjects');
    expect(enriched.availableIn).toBe('0.3.0');
    expect(Array.isArray(enriched.suggestions)).toBe(true);
    expect(enriched.suggestions?.[0]).toContain('Flatten nested objects');
    expect(typeof enriched.documentation).toBe('string');
    expect(enriched.documentation).toContain('#nested-objects');
    expect(enriched.context?.limitationKey).toBe('nestedObjects');
    expect(enriched.context?.availableIn).toBe('0.3.0');
  });

  it('enrichErrorWithLimitation is a no-op for unknown keys', () => {
    const base = new (class extends FoundryError {})({
      message: 'Unknown',
      errorCode: ErrorCode.INTERNAL_ERROR,
    });
    const before = { ...base };
    const after = enrichErrorWithLimitation(base, 'doesNotExist');
    // Ensure important fields remain unchanged
    expect(after.errorCode).toBe(before.errorCode);
    expect(after.documentation).toBe(before.documentation);
    expect(after.limitationKey).toBe(before.limitationKey);
    expect(after.availableIn).toBe(before.availableIn);
  });

  it('registry completeness: all entries have required metadata', () => {
    const entries = Object.values(LIMITATIONS_REGISTRY);
    for (const e of entries) {
      expect(e.key).toBeTruthy();
      expect(e.title).toBeTruthy();
      expect(typeof e.errorCode).toBe('string');
      expect(e.availableIn).toMatch(/\d+\.\d+\.\d+/);
      expect(e.workaround.length).toBeGreaterThan(5);
      expect(e.workaroundExample.length).toBeGreaterThan(5);
      expect(e.docsAnchor.length).toBeGreaterThan(1);
      expect(e.featureExamples.length).toBeGreaterThan(0);
    }
  });
});
