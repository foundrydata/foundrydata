// REFONLY::{"anchors":["spec://§15#rng","spec://§14#diagnostics"],"summary":"JSON-safe replacer for BigInt and helpers for diagnostics payloads"}

export function jsonSafeReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

export type RatPublic = { num: string; den: string };

export function toJSONSafeRat(p: bigint, q: bigint): RatPublic {
  return { num: p.toString(), den: q.toString() };
}
