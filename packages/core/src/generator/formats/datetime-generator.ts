/**
 * DateTime Format Generator
 * Generates date-time strings in ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ)
 */

import { Result, ok } from '../../types/result.js';
import { GenerationError } from '../../types/errors.js';
import { isISO8601DateTime } from '../../types/schema.js';
import type {
  FormatGenerator,
  FormatOptions,
} from '../../registry/format-registry.js';

export class DateTimeGenerator implements FormatGenerator {
  readonly name = 'date-time';

  supports(format: string): boolean {
    return format === 'date-time' || format === 'datetime';
  }

  generate(options?: FormatOptions): Result<string, GenerationError> {
    const seed = options?.seed;
    const random = seed ? this.seededRandom(seed) : Math.random;

    // Generate a timestamp between 1970 and 2030 for reasonable test data
    const minYear = 1970;
    const maxYear = 2030;
    const year = minYear + Math.floor(random() * (maxYear - minYear + 1));

    // Generate month (1-12)
    const month = 1 + Math.floor(random() * 12);

    // Generate day based on month
    const daysInMonth = this.getDaysInMonth(month, year);
    const day = 1 + Math.floor(random() * daysInMonth);

    // Generate time components
    const hour = Math.floor(random() * 24);
    const minute = Math.floor(random() * 60);
    const second = Math.floor(random() * 60);

    // Format as ISO 8601 (YYYY-MM-DDTHH:mm:ssZ)
    const formattedMonth = month.toString().padStart(2, '0');
    const formattedDay = day.toString().padStart(2, '0');
    const formattedHour = hour.toString().padStart(2, '0');
    const formattedMinute = minute.toString().padStart(2, '0');
    const formattedSecond = second.toString().padStart(2, '0');

    const dateTimeString = `${year}-${formattedMonth}-${formattedDay}T${formattedHour}:${formattedMinute}:${formattedSecond}Z`;

    return ok(dateTimeString);
  }

  validate(value: string): boolean {
    return isISO8601DateTime(value);
  }

  getExamples(): string[] {
    return [
      '2023-01-15T14:30:00Z',
      '2022-12-31T23:59:59Z',
      '2024-06-30T12:00:00Z',
      '1990-07-04T16:45:30Z',
      '2025-03-14T09:15:45Z',
    ];
  }

  /**
   * Get the number of days in a given month/year
   */
  private getDaysInMonth(month: number, year: number): number {
    switch (month) {
      case 2: // February
        return this.isLeapYear(year) ? 29 : 28;
      case 4:
      case 6:
      case 9:
      case 11: // April, June, September, November
        return 30;
      default: // January, March, May, July, August, October, December
        return 31;
    }
  }

  /**
   * Check if a year is a leap year
   */
  private isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  /**
   * Simple seeded random number generator for deterministic output
   */
  private seededRandom(seed: number): () => number {
    let current = seed;
    return () => {
      const x = Math.sin(current++) * 10000;
      return x - Math.floor(x);
    };
  }
}
