/**
 * Result<T, E> type for functional error handling
 * Inspired by Rust's Result type, provides explicit error handling without exceptions
 */

export type Result<T, E> = Ok<T> | Err<E>;

/**
 * Success variant of Result<T, E>
 */
export class Ok<T> {
  readonly _tag = 'Ok' as const;

  constructor(public readonly value: T) {}

  isOk(): this is Ok<T> {
    return true;
  }

  isErr(): this is never {
    return false;
  }

  /**
   * Transform the success value using the provided function
   */
  map<U>(fn: (value: T) => U): Result<U, never> {
    return new Ok(fn(this.value));
  }

  /**
   * Map over the error value (no-op for Ok)
   */
  mapErr<F>(_fn: (_error: never) => F): Result<T, F> {
    return this as Result<T, F>;
  }

  /**
   * Chain operations that may fail
   */
  flatMap<U, F>(fn: (value: T) => Result<U, F>): Result<U, F> {
    return fn(this.value);
  }

  /**
   * Get the value or throw an error
   * Use sparingly - prefer pattern matching with isOk/isErr
   */
  unwrap(): T {
    return this.value;
  }

  /**
   * Get the value or return the provided default
   */
  unwrapOr(_defaultValue: T): T {
    return this.value;
  }
}

/**
 * Error variant of Result<T, E>
 */
export class Err<E> {
  readonly _tag = 'Err' as const;

  constructor(public readonly error: E) {}

  isOk(): this is never {
    return false;
  }

  isErr(): this is Err<E> {
    return true;
  }

  /**
   * Map over the success value (no-op for Err)
   */
  map<U>(_fn: (_value: never) => U): Result<U, E> {
    return this as Result<U, E>;
  }

  /**
   * Transform the error value using the provided function
   */
  mapErr<F>(fn: (error: E) => F): Result<never, F> {
    return new Err(fn(this.error));
  }

  /**
   * Chain operations that may fail (no-op for Err)
   */
  flatMap<U, F>(_fn: (_value: never) => Result<U, F>): Result<U, E | F> {
    return this as Result<U, E | F>;
  }

  /**
   * Get the value or throw an error
   * Use sparingly - prefer pattern matching with isOk/isErr
   */
  unwrap(): never {
    throw new Error(`Called unwrap on an Err value: ${String(this.error)}`);
  }

  /**
   * Get the value or return the provided default
   */
  unwrapOr<T>(defaultValue: T): T {
    return defaultValue;
  }
}

/**
 * Helper function to create a success Result
 */
export function ok<T>(value: T): Ok<T> {
  return new Ok(value);
}

/**
 * Helper function to create an error Result
 */
export function err<E>(error: E): Err<E> {
  return new Err(error);
}

/**
 * Type guards for Result variants
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.isOk();
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result.isErr();
}
