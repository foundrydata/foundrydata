/**
 * Email Format Generator
 * Generates realistic email addresses using common patterns
 */

import { Result, ok } from '../../types/result';
import { GenerationError } from '../../types/errors';
import { isEmail } from '../../types/schema';
import type {
  FormatGenerator,
  FormatOptions,
} from '../../registry/format-registry';

export class EmailGenerator implements FormatGenerator {
  readonly name = 'email';

  private readonly firstNames = [
    'john',
    'jane',
    'michael',
    'sarah',
    'david',
    'emily',
    'chris',
    'jessica',
    'alex',
    'samantha',
    'robert',
    'lisa',
    'james',
    'michelle',
    'daniel',
    'ashley',
  ];

  private readonly lastNames = [
    'smith',
    'johnson',
    'brown',
    'davis',
    'miller',
    'wilson',
    'garcia',
    'martinez',
    'anderson',
    'taylor',
    'thomas',
    'hernandez',
    'moore',
    'martin',
    'jackson',
    'thompson',
  ];

  private readonly domains = [
    'example.com',
    'test.org',
    'sample.net',
    'demo.co',
    'mock.io',
    'placeholder.dev',
    'testmail.com',
    'mockup.org',
    'dummy.net',
    'fake.co',
  ];

  private readonly patterns = [
    (first: string, last: string, _rand: () => number) => `${first}.${last}`,
    (first: string, last: string, _rand: () => number) => `${first}${last}`,
    (first: string, last: string, _rand: () => number) => `${first}_${last}`,
    (first: string, _last: string, rand: () => number) =>
      `${first}${Math.floor(rand() * 999)}`,
    (first: string, last: string, _rand: () => number) => `${first[0]}${last}`,
  ];

  supports(format: string): boolean {
    return format === 'email';
  }

  generate(options?: FormatOptions): Result<string, GenerationError> {
    const seed = options?.seed;
    const random = seed ? this.seededRandom(seed) : Math.random;

    const firstName =
      this.firstNames[Math.floor(random() * this.firstNames.length)] || 'user';
    const lastName =
      this.lastNames[Math.floor(random() * this.lastNames.length)] || 'test';
    const domain =
      this.domains[Math.floor(random() * this.domains.length)] || 'example.com';
    const pattern = this.patterns[Math.floor(random() * this.patterns.length)];

    if (!pattern) {
      return ok(`${firstName}.${lastName}@${domain}`);
    }

    const localPart = pattern(firstName, lastName, random);
    const email = `${localPart}@${domain}`;

    return ok(email);
  }

  validate(value: string): boolean {
    return isEmail(value);
  }

  getExamples(): string[] {
    return [
      'john.doe@example.com',
      'jane.smith@test.org',
      'user123@sample.net',
      'alex_johnson@demo.co',
      'mjohnson@mockup.org',
    ];
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
