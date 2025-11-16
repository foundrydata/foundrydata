import { describe, it, expect } from 'vitest';
import {
  resolveRowCount,
  resolveCompatMode,
  resolveOutputFormat,
  type CliOptions,
} from '../flags';

describe('CLI flag helpers', () => {
  describe('resolveRowCount', () => {
    it('defaults to 1 when no flags are provided', () => {
      const count = resolveRowCount({});
      expect(count).toBe(1);
    });

    it('uses rows when provided', () => {
      const count = resolveRowCount({ rows: '10' } as CliOptions);
      expect(count).toBe(10);
    });

    it('uses count when provided', () => {
      const count = resolveRowCount({ count: '5' } as CliOptions);
      expect(count).toBe(5);
    });

    it('accepts numeric values directly', () => {
      const count = resolveRowCount({ count: 7 } as CliOptions);
      expect(count).toBe(7);
    });

    it('throws on non-positive values', () => {
      expect(() => resolveRowCount({ count: '0' } as CliOptions)).toThrow(
        /Invalid count/
      );
      expect(() => resolveRowCount({ count: '-3' } as CliOptions)).toThrow(
        /Invalid count/
      );
    });

    it('throws when conflicting flags have different values', () => {
      expect(() =>
        resolveRowCount({ rows: '2', count: '3' } as CliOptions)
      ).toThrow(/Conflicting row count flags/);
    });
  });

  describe('resolveCompatMode', () => {
    it('defaults to strict when nothing is provided', () => {
      const mode = resolveCompatMode({} as CliOptions);
      expect(mode).toBe('strict');
    });

    it('prefers mode over compat when both are provided', () => {
      const mode = resolveCompatMode({
        mode: 'lax',
        compat: 'strict',
      } as CliOptions);
      expect(mode).toBe('lax');
    });

    it('throws on invalid values', () => {
      expect(() => resolveCompatMode({ mode: 'weird' } as CliOptions)).toThrow(
        /Invalid mode/
      );
    });
  });

  describe('resolveOutputFormat', () => {
    it('defaults to json when value is absent', () => {
      expect(resolveOutputFormat(undefined)).toBe('json');
      expect(resolveOutputFormat('')).toBe('json');
    });

    it('accepts json and ndjson (case-insensitive)', () => {
      expect(resolveOutputFormat('json')).toBe('json');
      expect(resolveOutputFormat('ndjson')).toBe('ndjson');
      expect(resolveOutputFormat('NDJSON')).toBe('ndjson');
    });

    it('throws on invalid formats', () => {
      expect(() => resolveOutputFormat('csv')).toThrow(/Invalid --out value/);
    });
  });
});
