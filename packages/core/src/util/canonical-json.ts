import { Buffer } from 'node:buffer';
import { jsonSafeReplacer } from './json-safe.js';

type CanonicalJSONValue =
  | null
  | boolean
  | number
  | string
  | CanonicalJSONValue[]
  | { [key: string]: CanonicalJSONValue };

export interface CanonicalJSONResult {
  text: string;
  buffer: Buffer;
  byteLength: number;
}

function normalizeNumber(value: number): number {
  if (Object.is(value, -0)) return 0;
  return value;
}

function canonicalizeParsed(value: CanonicalJSONValue): string {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'number') {
    const normalized = normalizeNumber(value as number);
    return JSON.stringify(normalized);
  }
  if (type === 'string') {
    return JSON.stringify(value as string);
  }
  if (type === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (Array.isArray(value)) {
    const serialized = value.map((item) =>
      canonicalizeParsed(item as CanonicalJSONValue)
    );
    return `[${serialized.join(',')}]`;
  }

  const record = value as Record<string, CanonicalJSONValue>;
  const entries = Object.keys(record)
    .sort()
    .map((key) => {
      const v = record[key]!;
      return `${JSON.stringify(key)}:${canonicalizeParsed(v)}`;
    });
  return `{${entries.join(',')}}`;
}

function toCanonicalJSON(value: unknown): CanonicalJSONValue {
  if (value === undefined) return null;
  const serialized = JSON.stringify(value, jsonSafeReplacer);
  if (serialized === undefined) return null;
  return JSON.parse(serialized) as CanonicalJSONValue;
}

export function canonicalizeForHash(value: unknown): CanonicalJSONResult {
  const canonicalValue = toCanonicalJSON(value);
  const text = canonicalizeParsed(canonicalValue);
  const buffer = Buffer.from(text, 'utf8');
  return {
    text,
    buffer,
    byteLength: buffer.byteLength,
  };
}
