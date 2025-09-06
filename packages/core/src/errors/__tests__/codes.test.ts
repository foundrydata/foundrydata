import { describe, test, expect } from 'vitest';
import {
  ErrorCode,
  EXIT_CODES,
  HTTP_STATUS_BY_CODE,
  type Severity,
} from '../codes';

describe('Error Code Infrastructure', () => {
  test('all error codes are unique', () => {
    const codes = Object.values(ErrorCode);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  test('EXIT_CODES covers every ErrorCode', () => {
    const enumCodes = Object.values(ErrorCode);
    const mappedCodes = Object.keys(EXIT_CODES);
    expect(mappedCodes.length).toBe(enumCodes.length);
    for (const code of enumCodes) {
      expect(EXIT_CODES[code]).toBeTypeOf('number');
    }
  });

  test('HTTP_STATUS_BY_CODE covers every ErrorCode', () => {
    const enumCodes = Object.values(ErrorCode);
    const mappedCodes = Object.keys(HTTP_STATUS_BY_CODE);
    expect(mappedCodes.length).toBe(enumCodes.length);
    for (const code of enumCodes) {
      expect(HTTP_STATUS_BY_CODE[code]).toBeTypeOf('number');
    }
  });

  test('HTTP status values are within 400-599', () => {
    for (const status of Object.values(HTTP_STATUS_BY_CODE)) {
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThanOrEqual(599);
    }
  });

  test('exit codes are within valid 1-255 range', () => {
    for (const exit of Object.values(EXIT_CODES)) {
      expect(exit).toBeGreaterThanOrEqual(1);
      expect(exit).toBeLessThanOrEqual(255);
    }
  });

  test('includes special codes E012 and E500', () => {
    expect(ErrorCode.CIRCULAR_REFERENCE_DETECTED).toBe('E012');
    expect(ErrorCode.INTERNAL_ERROR).toBe('E500');
    expect(typeof EXIT_CODES[ErrorCode.CIRCULAR_REFERENCE_DETECTED]).toBe(
      'number'
    );
    expect(
      typeof HTTP_STATUS_BY_CODE[ErrorCode.CIRCULAR_REFERENCE_DETECTED]
    ).toBe('number');
    expect(typeof EXIT_CODES[ErrorCode.INTERNAL_ERROR]).toBe('number');
    expect(typeof HTTP_STATUS_BY_CODE[ErrorCode.INTERNAL_ERROR]).toBe('number');
  });

  test('Severity type is exported and constrained', () => {
    const sev: Severity = 'error';
    expect(sev).toBe('error');
  });
});
