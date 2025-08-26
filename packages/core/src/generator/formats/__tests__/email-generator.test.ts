/**
 * Email Generator Tests
 */

import { describe, it as test, expect } from 'vitest';
import { EmailGenerator } from '../email-generator';
import { isOk } from '../../../types/result';

describe('EmailGenerator', () => {
  const generator = new EmailGenerator();

  describe('Basic Functionality', () => {
    test('should have correct name', () => {
      expect(generator.name).toBe('email');
    });

    test('should support email format', () => {
      expect(generator.supports('email')).toBe(true);
    });

    test('should not support other formats', () => {
      expect(generator.supports('uuid')).toBe(false);
      expect(generator.supports('date')).toBe(false);
      expect(generator.supports('invalid')).toBe(false);
    });
  });

  describe('Generation', () => {
    test('should generate valid email addresses', () => {
      const result = generator.generate();
      expect(isOk(result)).toBe(true);

      if (isOk(result)) {
        expect(typeof result.value).toBe('string');
        expect(result.value).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
        expect(result.value).toContain('@');
        expect(result.value).toContain('.');
      }
    });

    test('should generate different emails on successive calls', () => {
      const emails = new Set();

      for (let i = 0; i < 10; i++) {
        const result = generator.generate();
        if (isOk(result)) {
          emails.add(result.value);
        }
      }

      // Should have some variety (at least 5 different emails out of 10)
      expect(emails.size).toBeGreaterThanOrEqual(5);
    });

    test('should generate deterministic emails with seed', () => {
      const result1 = generator.generate({ seed: 12345 });
      const result2 = generator.generate({ seed: 12345 });

      expect(isOk(result1)).toBe(true);
      expect(isOk(result2)).toBe(true);

      if (isOk(result1) && isOk(result2)) {
        expect(result1.value).toBe(result2.value);
      }
    });

    test('should generate different emails with different seeds', () => {
      const result1 = generator.generate({ seed: 11111 });
      const result2 = generator.generate({ seed: 22222 });

      expect(isOk(result1)).toBe(true);
      expect(isOk(result2)).toBe(true);

      if (isOk(result1) && isOk(result2)) {
        expect(result1.value).not.toBe(result2.value);
      }
    });

    test('should use test domains', () => {
      const emails = [];

      for (let i = 0; i < 20; i++) {
        const result = generator.generate();
        if (isOk(result)) {
          emails.push(result.value);
        }
      }

      // Should contain some test domains
      const domains = emails.map((email) => email.split('@')[1]);
      const testDomains = [
        'example.com',
        'test.org',
        'sample.net',
        'demo.co',
        'mock.io',
      ];
      const hasTestDomain = domains.some((domain) =>
        testDomains.includes(domain)
      );

      expect(hasTestDomain).toBe(true);
    });
  });

  describe('Validation', () => {
    test('should validate correct email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.org',
        'user+tag@example.net',
        'user_name@test-domain.co.uk',
        'simple@domain.io',
      ];

      for (const email of validEmails) {
        expect(generator.validate(email)).toBe(true);
      }
    });

    test('should reject invalid email addresses', () => {
      const invalidEmails = [
        '',
        'not-an-email',
        '@domain.com',
        'user@',
        'user@domain',
        'user@@domain.com',
        'user name@domain.com', // space in local part
        'user@domain com', // space in domain
      ];

      for (const email of invalidEmails) {
        expect(generator.validate(email)).toBe(false);
      }
    });
  });

  describe('Examples', () => {
    test('should provide valid example email addresses', () => {
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
