/**
 * DateTime Generator Tests
 */

import { describe, test, expect } from '@jest/globals';
import { DateTimeGenerator } from '../datetime-generator';
import { isOk } from '../../../types/result';

describe('DateTimeGenerator', () => {
  const generator = new DateTimeGenerator();

  describe('Basic Functionality', () => {
    test('should have correct name', () => {
      expect(generator.name).toBe('date-time');
    });

    test('should support date-time format', () => {
      expect(generator.supports('date-time')).toBe(true);
    });

    test('should support datetime format', () => {
      expect(generator.supports('datetime')).toBe(true);
    });

    test('should not support other formats', () => {
      expect(generator.supports('uuid')).toBe(false);
      expect(generator.supports('email')).toBe(false);
      expect(generator.supports('date')).toBe(false);
      expect(generator.supports('invalid')).toBe(false);
    });
  });

  describe('Generation', () => {
    test('should generate valid ISO 8601 date-times', () => {
      const result = generator.generate();
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        expect(typeof result.value).toBe('string');
        expect(result.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);

        // Should be a valid date
        const date = new Date(result.value);
        expect(date.toString()).not.toBe('Invalid Date');
      }
    });

    test('should generate date-times in reasonable range', () => {
      const results = [];

      for (let i = 0; i < 10; i++) {
        const result = generator.generate();
        if (isOk(result)) {
          results.push(result.value);
        }
      }

      for (const dateTimeString of results) {
        const year = parseInt(dateTimeString.substring(0, 4));
        expect(year).toBeGreaterThanOrEqual(1970);
        expect(year).toBeLessThanOrEqual(2030);

        // Extract and validate time components
        const [datePart, timePart] = dateTimeString.split('T');
        const timeWithoutZ = timePart.replace('Z', '');
        const [hour, minute, second] = timeWithoutZ.split(':').map(Number);

        expect(hour).toBeGreaterThanOrEqual(0);
        expect(hour).toBeLessThanOrEqual(23);
        expect(minute).toBeGreaterThanOrEqual(0);
        expect(minute).toBeLessThanOrEqual(59);
        expect(second).toBeGreaterThanOrEqual(0);
        expect(second).toBeLessThanOrEqual(59);
      }
    });

    test('should generate different date-times on successive calls', () => {
      const dateTimes = new Set();

      for (let i = 0; i < 20; i++) {
        const result = generator.generate();
        if (isOk(result)) {
          dateTimes.add(result.value);
        }
      }

      // Should have some variety
      expect(dateTimes.size).toBeGreaterThan(1);
    });

    test('should generate deterministic date-times with seed', () => {
      const result1 = generator.generate({ seed: 12345 });
      const result2 = generator.generate({ seed: 12345 });

      expect(isOk(result1)).toBe(true);
      expect(isOk(result2)).toBe(true);

      if (isOk(result1) && isOk(result2)) {
        expect(result1.value).toBe(result2.value);
      }
    });

    test('should generate different date-times with different seeds', () => {
      const result1 = generator.generate({ seed: 11111 });
      const result2 = generator.generate({ seed: 22222 });

      expect(isOk(result1)).toBe(true);
      expect(isOk(result2)).toBe(true);

      if (isOk(result1) && isOk(result2)) {
        expect(result1.value).not.toBe(result2.value);
      }
    });

    test('should generate valid days for each month', () => {
      // Generate many date-times to check month/day combinations
      const dateTimes = [];

      for (let i = 0; i < 100; i++) {
        const result = generator.generate({ seed: i });
        if (isOk(result)) {
          dateTimes.push(result.value);
        }
      }

      for (const dateTimeString of dateTimes) {
        const [datePart] = dateTimeString.split('T');
        const [year, month, day] = datePart.split('-').map(Number);

        expect(month).toBeGreaterThanOrEqual(1);
        expect(month).toBeLessThanOrEqual(12);
        expect(day).toBeGreaterThanOrEqual(1);

        // Check maximum days per month
        if (month === 2) {
          // February - check leap year logic
          const isLeapYear =
            (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
          const maxDays = isLeapYear ? 29 : 28;
          expect(day).toBeLessThanOrEqual(maxDays);
        } else if ([4, 6, 9, 11].includes(month)) {
          // April, June, September, November - 30 days
          expect(day).toBeLessThanOrEqual(30);
        } else {
          // All other months - 31 days
          expect(day).toBeLessThanOrEqual(31);
        }
      }
    });
  });

  describe('Validation', () => {
    test('should validate correct ISO 8601 date-times', () => {
      const validDateTimes = [
        '2023-01-01T00:00:00Z',
        '2023-12-31T23:59:59Z',
        '2024-02-29T12:30:45Z', // leap year
        '2000-02-29T06:15:30Z', // century leap year
        '1999-02-28T18:45:00Z', // non-leap year
      ];

      for (const dateTime of validDateTimes) {
        expect(generator.validate(dateTime)).toBe(true);
      }
    });

    test('should reject invalid date-time formats', () => {
      const invalidDateTimes = [
        '',
        'not-a-datetime',
        '2023-01-01', // date only
        '2023-1-1T00:00:00Z', // single digit month/day
        '23-01-01T00:00:00Z', // two-digit year
        '2023/01/01T00:00:00Z', // wrong separator
        '2023-01-01 00:00:00Z', // space instead of T
      ];

      for (const dateTime of invalidDateTimes) {
        expect(generator.validate(dateTime)).toBe(false);
      }
    });
  });

  describe('Examples', () => {
    test('should provide valid example date-times', () => {
      const examples = generator.getExamples();

      expect(Array.isArray(examples)).toBe(true);
      expect(examples.length).toBeGreaterThan(0);

      for (const example of examples) {
        expect(generator.validate(example)).toBe(true);
      }
    });

    test('should provide diverse examples', () => {
      const examples = generator.getExamples();
      const uniqueExamples = new Set(examples);

      expect(uniqueExamples.size).toBe(examples.length);
    });
  });
});
