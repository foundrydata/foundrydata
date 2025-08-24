/**
 * Tests for Result<T, E> pattern
 * Comprehensive test coverage for Ok and Err variants
 */

import { Result, Ok, Err, ok, err, isOk, isErr } from '../result';

describe('Result Pattern', () => {
  describe('Ok class', () => {
    it('should create Ok instance with value', () => {
      const result = new Ok(42);

      expect(result.value).toBe(42);
      expect(result._tag).toBe('Ok');
    });

    it('should return true for isOk()', () => {
      const result = new Ok('test');

      expect(result.isOk()).toBe(true);
      expect(result.isErr()).toBe(false);
    });

    it('should map over success value', () => {
      const result = new Ok(10);
      const mapped = result.map((x) => x * 2);

      expect(mapped.isOk()).toBe(true);
      if (mapped.isOk()) {
        expect(mapped.value).toBe(20);
      }
    });

    it('should not affect mapErr for Ok', () => {
      const result = new Ok('success');
      const mapped = result.mapErr((_err: never) => 'error');

      expect(mapped.isOk()).toBe(true);
      if (mapped.isOk()) {
        expect(mapped.value).toBe('success');
      }
    });

    it('should flatMap to another result', () => {
      const result = new Ok(5);
      const flatMapped = result.flatMap((x) => ok(x * 3));

      expect(flatMapped.isOk()).toBe(true);
      if (flatMapped.isOk()) {
        expect(flatMapped.value).toBe(15);
      }
    });

    it('should flatMap to error result', () => {
      const result = new Ok(5);
      const flatMapped = result.flatMap((_x) => err('failed'));

      expect(flatMapped.isErr()).toBe(true);
      if (flatMapped.isErr()) {
        expect(flatMapped.error).toBe('failed');
      }
    });

    it('should unwrap to value', () => {
      const result = new Ok('unwrapped');

      expect(result.unwrap()).toBe('unwrapped');
    });

    it('should return value for unwrapOr', () => {
      const result = new Ok('actual');

      expect(result.unwrapOr('default')).toBe('actual');
    });
  });

  describe('Err class', () => {
    it('should create Err instance with error', () => {
      const result = new Err('failure');

      expect(result.error).toBe('failure');
      expect(result._tag).toBe('Err');
    });

    it('should return true for isErr()', () => {
      const result = new Err('test error');

      expect(result.isOk()).toBe(false);
      expect(result.isErr()).toBe(true);
    });

    it('should not affect map for Err', () => {
      const result = new Err('error');
      const mapped = result.map((_x: never) => 'mapped');

      expect(mapped.isErr()).toBe(true);
      if (mapped.isErr()) {
        expect(mapped.error).toBe('error');
      }
    });

    it('should mapErr over error value', () => {
      const result = new Err('original');
      const mapped = result.mapErr((err) => `Modified: ${err}`);

      expect(mapped.isErr()).toBe(true);
      if (mapped.isErr()) {
        expect(mapped.error).toBe('Modified: original');
      }
    });

    it('should not affect flatMap for Err', () => {
      const result = new Err('error');
      const flatMapped = result.flatMap((_x: never) => ok('success'));

      expect(flatMapped.isErr()).toBe(true);
      if (flatMapped.isErr()) {
        expect(flatMapped.error).toBe('error');
      }
    });

    it('should throw on unwrap', () => {
      const result = new Err('test error');

      expect(() => result.unwrap()).toThrow(
        'Called unwrap on an Err value: test error'
      );
    });

    it('should return default for unwrapOr', () => {
      const result = new Err('error');

      expect(result.unwrapOr('default')).toBe('default');
    });
  });

  describe('Helper functions', () => {
    it('should create Ok with ok() helper', () => {
      const result = ok(123);

      expect(result).toBeInstanceOf(Ok);
      expect(result.isOk()).toBe(true);
      expect(result.value).toBe(123);
    });

    it('should create Err with err() helper', () => {
      const result = err('helper error');

      expect(result).toBeInstanceOf(Err);
      expect(result.isErr()).toBe(true);
      expect(result.error).toBe('helper error');
    });
  });

  describe('Type guards', () => {
    it('should correctly identify Ok with isOk()', () => {
      const okResult: Result<string, number> = ok('success');
      const errResult: Result<string, number> = err(404);

      expect(isOk(okResult)).toBe(true);
      expect(isOk(errResult)).toBe(false);
    });

    it('should correctly identify Err with isErr()', () => {
      const okResult: Result<string, number> = ok('success');
      const errResult: Result<string, number> = err(404);

      expect(isErr(okResult)).toBe(false);
      expect(isErr(errResult)).toBe(true);
    });

    it('should provide type narrowing', () => {
      const result: Result<string, number> =
        Math.random() > 0.5 ? ok('test') : err(500);

      if (isOk(result)) {
        // TypeScript should narrow this to Ok<string>
        expect(typeof result.value).toBe('string');
        expect(result.value.length).toBeGreaterThanOrEqual(0);
      }

      if (isErr(result)) {
        // TypeScript should narrow this to Err<number>
        expect(typeof result.error).toBe('number');
        expect(result.error).toBeGreaterThan(0);
      }
    });
  });

  describe('Chaining operations', () => {
    it('should chain map operations', () => {
      const result = ok(10)
        .map((x) => x * 2)
        .map((x) => x + 1)
        .map((x) => x.toString());

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe('21');
      }
    });

    it('should short-circuit on error', () => {
      const result: Result<number, string> = err('initial error');
      const chained = result.map((x) => x * 2).map((x) => x + 1);

      expect(chained.isErr()).toBe(true);
      if (chained.isErr()) {
        expect(chained.error).toBe('initial error');
      }
    });

    it('should chain flatMap operations', () => {
      const divide = (a: number, b: number): Result<number, string> =>
        b === 0 ? err('Division by zero') : ok(a / b);

      const result = ok(20)
        .flatMap((x) => divide(x, 4))
        .flatMap((x) => divide(x, 5));

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(1);
      }
    });

    it('should fail fast in flatMap chain', () => {
      const divide = (a: number, b: number): Result<number, string> =>
        b === 0 ? err('Division by zero') : ok(a / b);

      const result = ok(20)
        .flatMap((x) => divide(x, 0)) // This should fail
        .flatMap((x) => divide(x, 5)); // This should not execute

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe('Division by zero');
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle null values', () => {
      const okNull = ok(null);
      const errNull = err(null);

      expect(okNull.isOk()).toBe(true);
      expect(okNull.value).toBeNull();

      expect(errNull.isErr()).toBe(true);
      expect(errNull.error).toBeNull();
    });

    it('should handle undefined values', () => {
      const okUndefined = ok(undefined);
      const errUndefined = err(undefined);

      expect(okUndefined.isOk()).toBe(true);
      expect(okUndefined.value).toBeUndefined();

      expect(errUndefined.isErr()).toBe(true);
      expect(errUndefined.error).toBeUndefined();
    });

    it('should handle complex objects', () => {
      const obj = { nested: { value: 42 }, array: [1, 2, 3] };
      const result = ok(obj);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.nested.value).toBe(42);
        expect(result.value.array).toEqual([1, 2, 3]);
      }
    });

    it('should handle function values', () => {
      const fn = (x: number): number => x * 2;
      const result = ok(fn);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(typeof result.value).toBe('function');
        expect(result.value(5)).toBe(10);
      }
    });
  });

  describe('Type safety', () => {
    it('should maintain type safety through transformations', () => {
      // This test mainly verifies TypeScript compilation
      const stringResult: Result<string, Error> = ok('hello');
      const numberResult: Result<number, Error> = stringResult.map(
        (s) => s.length
      );
      const booleanResult: Result<boolean, Error> = numberResult.map(
        (n) => n > 3
      );

      expect(booleanResult.isOk()).toBe(true);
      if (booleanResult.isOk()) {
        expect(typeof booleanResult.value).toBe('boolean');
        expect(booleanResult.value).toBe(true);
      }
    });

    it('should handle generic constraints properly', () => {
      interface User {
        id: number;
        name: string;
      }

      const userResult: Result<User, string> = ok({ id: 1, name: 'John' });
      const nameResult = userResult.map((user) => user.name);

      expect(nameResult.isOk()).toBe(true);
      if (nameResult.isOk()) {
        expect(nameResult.value).toBe('John');
      }
    });
  });
});
