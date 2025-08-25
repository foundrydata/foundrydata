/**
 * Date Format Generator
 * Generates dates in YYYY-MM-DD format (ISO 8601 date format)
 */

import { Result, ok } from '../../types/result';
import { GenerationError } from '../../types/errors';
import { isISO8601Date } from '../../types/schema';
import type {
  FormatGenerator,
  FormatOptions,
} from '../../registry/format-registry';

export class DateGenerator implements FormatGenerator {
  readonly name = 'date';

  supports(format: string): boolean {
    return format === 'date';
  }

  generate(options?: FormatOptions): Result<string, GenerationError> {
    const seed = options?.seed;
    const random = seed ? this.seededRandom(seed) : Math.random;

    // Generate a date between 1970 and 2030 for reasonable test data
    const minYear = 1970;
    const maxYear = 2030;
    const year = minYear + Math.floor(random() * (maxYear - minYear + 1));

    // Generate month (1-12)
    const month = 1 + Math.floor(random() * 12);

    // Generate day based on month (simplified - doesn't handle leap years perfectly)
    const daysInMonth = this.getDaysInMonth(month, year);
    const day = 1 + Math.floor(random() * daysInMonth);

    // Format as YYYY-MM-DD
    const formattedMonth = month.toString().padStart(2, '0');
    const formattedDay = day.toString().padStart(2, '0');
    const dateString = `${year}-${formattedMonth}-${formattedDay}`;

    return ok(dateString);
  }

  validate(value: string): boolean {
    return isISO8601Date(value);
  }

  getExamples(): string[] {
    return [
      '2023-01-15',
      '2022-12-31',
      '2024-06-30',
      '1990-07-04',
      '2025-03-14',
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
