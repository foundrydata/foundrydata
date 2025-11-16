import { XorShift32 } from '../util/rng.js';

export type SupportedFormat = 'email' | 'uri' | 'uuid' | 'date-time';

export interface FormatRegistryOptions {
  seed: number;
}

export interface FormatGenerationError {
  kind: 'unsupported-format';
  format: string;
}

export interface FormatGenerationResult {
  isOk(): this is FormatGenerationSuccess;
  isErr(): this is FormatGenerationFailure;
  value?: string;
  error?: FormatGenerationError;
}

export interface FormatRegistry {
  generate(format: string): FormatGenerationResult;
}

class FormatGenerationSuccess implements FormatGenerationResult {
  public readonly value: string;
  public readonly error = undefined;

  constructor(value: string) {
    this.value = value;
  }

  isOk(): this is FormatGenerationSuccess {
    return true;
  }

  isErr(): this is FormatGenerationFailure {
    return false;
  }
}

class FormatGenerationFailure implements FormatGenerationResult {
  public readonly value = undefined;
  public readonly error: FormatGenerationError;

  constructor(error: FormatGenerationError) {
    this.error = error;
  }

  isOk(): this is FormatGenerationSuccess {
    return false;
  }

  isErr(): this is FormatGenerationFailure {
    return true;
  }
}

export function createFormatRegistry(
  options: FormatRegistryOptions
): FormatRegistry {
  return new DefaultFormatRegistry(options);
}

class DefaultFormatRegistry implements FormatRegistry {
  private readonly seed: number;

  private readonly counters: Record<SupportedFormat, number> = {
    email: 0,
    uri: 0,
    uuid: 0,
    'date-time': 0,
  };

  constructor(options: FormatRegistryOptions) {
    this.seed = options.seed >>> 0;
  }

  generate(format: string): FormatGenerationResult {
    const normalized = format.toLowerCase();
    if (!isSupportedFormat(normalized)) {
      return new FormatGenerationFailure({
        kind: 'unsupported-format',
        format,
      });
    }

    switch (normalized) {
      case 'email':
        return new FormatGenerationSuccess(this.generateEmail());
      case 'uri':
        return new FormatGenerationSuccess(this.generateUri());
      case 'uuid':
        return new FormatGenerationSuccess(this.generateUuid());
      case 'date-time':
        return new FormatGenerationSuccess(this.generateDateTime());
      default:
        return new FormatGenerationFailure({
          kind: 'unsupported-format',
          format,
        });
    }
  }

  private nextRng(format: SupportedFormat): XorShift32 {
    const index = this.counters[format];
    this.counters[format] = index + 1;
    return new XorShift32(this.seed, `format:${format}:${index}`);
  }

  private generateEmail(): string {
    const rng = this.nextRng('email');
    const suffix = rng.next().toString(36).padStart(6, '0');
    return `user.${suffix}@example.test`;
  }

  private generateUri(): string {
    const rng = this.nextRng('uri');
    const segment = rng.next().toString(36).padStart(6, '0');
    return `https://example.test/resource/${segment}`;
  }

  private generateUuid(): string {
    const rng = this.nextRng('uuid');
    const bytes = new Uint8Array(16);
    let buffer = 0;
    let offset = 4;
    for (let idx = 0; idx < bytes.length; idx += 1) {
      if (offset >= 4) {
        buffer = rng.next();
        offset = 0;
      }
      bytes[idx] = (buffer >>> (offset * 8)) & 0xff;
      offset += 1;
    }
    // Enforce RFC 4122 variant 4
    const variant = bytes[6] ?? 0;
    bytes[6] = ((variant & 0x0f) | 0x40) & 0xff;
    const clockSeq = bytes[8] ?? 0;
    bytes[8] = ((clockSeq & 0x3f) | 0x80) & 0xff;
    return formatUuid(bytes);
  }

  private generateDateTime(): string {
    const rng = this.nextRng('date-time');
    const base = Date.UTC(2024, 0, 1, 0, 0, 0, 0);
    const dayOffset = rng.next() % 365;
    const secondOffset = rng.next() % 86400;
    const timestamp = base + dayOffset * 86_400_000 + secondOffset * 1_000;
    return new Date(timestamp).toISOString();
  }
}

function formatUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

function isSupportedFormat(value: string): value is SupportedFormat {
  return (
    value === 'email' ||
    value === 'uri' ||
    value === 'uuid' ||
    value === 'date-time'
  );
}
