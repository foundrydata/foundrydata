/**
 * Date Generator Tests
 */

import { describe, test, expect } from '@jest/globals';
import { DateGenerator } from '../date-generator';
import { isOk } from '../../../types/result';

describe('DateGenerator', () => {
  const generator = new DateGenerator();

  describe('Basic Functionality', () => {
    test('should have correct name', () => {
      expect(generator.name).toBe('date');
    });

    test('should support date format', () => {
      expect(generator.supports('date')).toBe(true);
    });

    test('should not support other formats', () => {
      expect(generator.supports('uuid')).toBe(false);
      expect(generator.supports('email')).toBe(false);
      expect(generator.supports('date-time')).toBe(false);
      expect(generator.supports('invalid')).toBe(false);
    });
  });

  describe('Generation', () => {
    test('should generate valid ISO 8601 dates', () => {
      const result = generator.generate();
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        expect(typeof result.value).toBe('string');
        expect(result.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);

        // Should be a valid date
        const date = new Date(result.value);
        expect(date.toString()).not.toBe('Invalid Date');
      }
    });

    test('should generate dates in reasonable range', () => {
      const results = [];

      for (let i = 0; i < 10; i++) {
        const result = generator.generate();
        if (isOk(result)) {
          results.push(result.value);
        }
      }

      for (const dateString of results) {
        const year = parseInt(dateString.substring(0, 4));
        expect(year).toBeGreaterThanOrEqual(1970);
        expect(year).toBeLessThanOrEqual(2030);
      }
    });

    test('should generate different dates on successive calls', () => {
      const dates = new Set();

      for (let i = 0; i < 20; i++) {
        const result = generator.generate();
        if (isOk(result)) {
          dates.add(result.value);
        }
      }

      // Should have some variety
      expect(dates.size).toBeGreaterThan(1);
    });

    test('should generate deterministic dates with seed', () => {
      const result1 = generator.generate({ seed: 12345 });
      const result2 = generator.generate({ seed: 12345 });

      expect(isOk(result1)).toBe(true);
      expect(isOk(result2)).toBe(true);

      if (isOk(result1) && isOk(result2)) {
        expect(result1.value).toBe(result2.value);
      }
    });

    test('should generate different dates with different seeds', () => {
      const result1 = generator.generate({ seed: 11111 });
      const result2 = generator.generate({ seed: 22222 });

      expect(isOk(result1)).toBe(true);
      expect(isOk(result2)).toBe(true);

      if (isOk(result1) && isOk(result2)) {
        expect(result1.value).not.toBe(result2.value);
      }
    });

    test('should generate valid days for each month', () => {
      // Generate many dates to check month/day combinations
      const dates = [];

      for (let i = 0; i < 100; i++) {
        const result = generator.generate({ seed: i });
        if (isOk(result)) {
          dates.push(result.value);
        }
      }

      for (const dateString of dates) {
        const [year, month, day] = dateString.split('-').map(Number);

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
    test('should validate correct ISO 8601 dates', () => {
      const validDates = [
        '2023-01-01',
        '2023-12-31',
        '2024-02-29', // leap year
        '2000-02-29', // century leap year
        '1999-02-28', // non-leap year
      ];

      for (const date of validDates) {
        expect(generator.validate(date)).toBe(true);
      }
    });

    test('should reject invalid date formats', () => {
      const invalidDates = [
        '',
        'not-a-date',
        '2023-1-1', // single digit month/day
        '23-01-01', // two-digit year
        '2023/01/01', // wrong separator
        '2023-01-01T00:00:00Z', // date-time format
      ];

      for (const date of invalidDates) {
        expect(generator.validate(date)).toBe(false);
      }
    });
  });

  describe('Examples', () => {
    test('should provide valid example dates', () => {
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
