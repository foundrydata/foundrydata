/* eslint-disable max-lines */
/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */

export interface CharRange {
  from: number;
  to: number;
}

export interface NfaTransition {
  to: number;
  range?: CharRange;
}

export interface NfaState {
  id: number;
  epsilon: number[];
  transitions: NfaTransition[];
}

export interface Nfa {
  start: number;
  accept: number;
  states: NfaState[];
}

export interface NfaBuildOptions {
  /** Maximum allowed NFA states before declaring a cap (default: 4_096). */
  maxStates?: number;
}

export interface NfaBuildResult {
  nfa: Nfa;
  stateCount: number;
  capped: boolean;
}

type RegexNode =
  | { kind: 'empty' }
  | { kind: 'literal'; value: string }
  | { kind: 'charClass'; ranges: CharRange[] }
  | { kind: 'concat'; left: RegexNode; right: RegexNode }
  | { kind: 'alt'; left: RegexNode; right: RegexNode }
  | { kind: 'quantifier'; child: RegexNode; min: number; max: number | null };

class RegexParseError extends Error {}

class RegexParser {
  private readonly pattern: string;
  private pos = 0;

  constructor(pattern: string) {
    this.pattern = pattern;
  }

  parse(): RegexNode {
    const node = this.parseAlternation();
    if (this.pos !== this.pattern.length) {
      throw new RegexParseError('Unexpected trailing input in regex pattern');
    }
    return node;
  }

  private parseAlternation(): RegexNode {
    let left = this.parseConcatenation();
    while (!this.isAtEnd() && this.peek() === '|') {
      this.consume(); // '|'
      const right = this.parseConcatenation();
      left = { kind: 'alt', left, right };
    }
    return left;
  }

  private parseConcatenation(): RegexNode {
    const terms: RegexNode[] = [];
    while (!this.isAtEnd() && this.peek() !== ')' && this.peek() !== '|') {
      terms.push(this.parseRepetition());
    }
    if (terms.length === 0) {
      return { kind: 'empty' };
    }
    let node = terms[0]!;
    for (let i = 1; i < terms.length; i += 1) {
      node = { kind: 'concat', left: node, right: terms[i]! };
    }
    return node;
  }

  private parseRepetition(): RegexNode {
    let node = this.parseAtom();
    while (!this.isAtEnd()) {
      const ch = this.peek();
      if (ch === '?' || ch === '*' || ch === '+' || ch === '{') {
        node = this.applyQuantifier(node);
      } else {
        break;
      }
    }
    return node;
  }

  private applyQuantifier(child: RegexNode): RegexNode {
    const ch = this.consume();
    if (ch === '?') {
      return { kind: 'quantifier', child, min: 0, max: 1 };
    }
    if (ch === '*') {
      return { kind: 'quantifier', child, min: 0, max: null };
    }
    if (ch === '+') {
      return { kind: 'quantifier', child, min: 1, max: null };
    }
    // bounded {m,n}
    const bound = this.readUntil('}');
    if (!bound.endsWith('}')) {
      throw new RegexParseError('Unterminated bounded quantifier');
    }
    const body = bound.slice(0, -1);
    const parts = body.split(',');
    let min: number;
    let max: number | null = null;
    if (parts.length === 1) {
      min = parseInt(parts[0]!, 10);
      max = min;
    } else if (parts.length === 2) {
      min = parts[0] ? parseInt(parts[0]!, 10) : 0;
      max = parts[1] ? parseInt(parts[1]!, 10) : null;
    } else {
      throw new RegexParseError('Invalid bounded quantifier');
    }
    if (!Number.isFinite(min) || min < 0 || (max !== null && max < min)) {
      throw new RegexParseError('Invalid bounded quantifier range');
    }
    return { kind: 'quantifier', child, min, max };
  }

  private parseAtom(): RegexNode {
    if (this.isAtEnd()) {
      return { kind: 'empty' };
    }
    const ch = this.peek();
    if (ch === '(') {
      this.consume();
      // Support non-capturing groups (?:...) used in anchored-safe patterns.
      if (!this.isAtEnd() && this.peek() === '?') {
        this.consume();
        if (this.isAtEnd() || this.consume() !== ':') {
          throw new RegexParseError('Unsupported group construct');
        }
      }
      const node = this.parseAlternation();
      if (this.isAtEnd() || this.consume() !== ')') {
        throw new RegexParseError('Unbalanced parenthesis in regex');
      }
      return node;
    }
    if (ch === '[') {
      return this.parseCharClass();
    }
    if (ch === '.') {
      this.consume();
      return {
        kind: 'charClass',
        ranges: [{ from: 0x0000, to: 0xffff }],
      };
    }
    if (ch === '\\') {
      this.consume();
      if (this.isAtEnd()) {
        throw new RegexParseError('Dangling escape at end of pattern');
      }
      const escaped = this.consume();
      return this.parseEscaped(escaped);
    }
    if ('|)?*+{}'.includes(ch)) {
      throw new RegexParseError(`Unexpected token "${ch}" in atom`);
    }
    this.consume();
    return { kind: 'literal', value: ch };
  }

  private parseEscaped(escaped: string): RegexNode {
    if (escaped === 'd') {
      return {
        kind: 'charClass',
        ranges: [{ from: 0x30, to: 0x39 }],
      };
    }
    if (escaped === 'w') {
      const ranges: CharRange[] = [
        { from: 0x30, to: 0x39 }, // 0-9
        { from: 0x41, to: 0x5a }, // A-Z
        { from: 0x5f, to: 0x5f }, // _
        { from: 0x61, to: 0x7a }, // a-z
      ];
      return { kind: 'charClass', ranges };
    }
    if (escaped === 's') {
      const spaces = [' ', '\t', '\n', '\r', '\f', '\v'];
      const ranges: CharRange[] = spaces.map((c) => {
        const code = c.charCodeAt(0);
        return { from: code, to: code };
      });
      return { kind: 'charClass', ranges };
    }
    return { kind: 'literal', value: escaped };
  }

  private parseCharClass(): RegexNode {
    // Assumes current char is '['
    this.consume();
    if (this.isAtEnd()) {
      throw new RegexParseError('Unterminated character class');
    }
    let negated = false;
    if (this.peek() === '^') {
      negated = true;
      this.consume();
    }
    const ranges: CharRange[] = [];
    let first = true;
    while (!this.isAtEnd()) {
      const ch = this.consume();
      if (ch === ']' && !first) {
        break;
      }
      first = false;

      if (ch === '\\') {
        if (this.isAtEnd()) {
          throw new RegexParseError('Dangling escape in character class');
        }
        const escaped = this.consume();
        const code = escaped.charCodeAt(0);
        ranges.push({ from: code, to: code });
        continue;
      }

      if (
        !this.isAtEnd() &&
        this.peek() === '-' &&
        this.pos + 1 < this.pattern.length &&
        this.pattern[this.pos + 1] !== ']'
      ) {
        this.consume(); // '-'
        if (this.isAtEnd()) {
          throw new RegexParseError('Unterminated range in character class');
        }
        const endChar = this.consume();
        const startCode = ch.codePointAt(0);
        const endCode = endChar.codePointAt(0);
        if (
          startCode === undefined ||
          endCode === undefined ||
          startCode > endCode
        ) {
          throw new RegexParseError('Invalid range in character class');
        }
        ranges.push({ from: startCode, to: endCode });
        continue;
      }

      ranges.push({ from: ch.charCodeAt(0), to: ch.charCodeAt(0) });
    }

    if (ranges.length === 0) {
      throw new RegexParseError('Empty character class');
    }

    if (negated) {
      // For now, treat negated classes as unsupported to keep semantics simple.
      // Future work can expand this to full complement logic.
      throw new RegexParseError('Negated character classes are not supported');
    }

    return { kind: 'charClass', ranges };
  }

  private isAtEnd(): boolean {
    return this.pos >= this.pattern.length;
  }

  private peek(): string {
    return this.pattern[this.pos]!;
  }

  private consume(): string {
    return this.pattern[this.pos++]!;
  }

  private readUntil(terminator: string): string {
    let result = '';
    while (!this.isAtEnd()) {
      const ch = this.consume();
      result += ch;
      if (ch === terminator) {
        break;
      }
    }
    return result;
  }
}

interface NfaFragment {
  start: number;
  accept: number;
}

class ThompsonBuilder {
  public readonly states: NfaState[] = [];
  private readonly maxStates: number;
  public capped = false;

  constructor(options?: NfaBuildOptions) {
    this.maxStates = options?.maxStates ?? 4096;
  }

  build(ast: RegexNode): NfaBuildResult {
    const fragment = this.buildNode(ast);
    return {
      nfa: {
        start: fragment.start,
        accept: fragment.accept,
        states: this.states,
      },
      stateCount: this.states.length,
      capped: this.capped,
    };
  }

  private newState(): NfaState {
    if (this.states.length >= this.maxStates) {
      this.capped = true;
      // Reuse the last state index to keep indices in range; further allocations
      // do not increase state count once capped.
      return this.states[this.states.length - 1]!;
    }
    const state: NfaState = {
      id: this.states.length,
      epsilon: [],
      transitions: [],
    };
    this.states.push(state);
    return state;
  }

  private addEpsilon(from: number, to: number): void {
    this.states[from]!.epsilon.push(to);
  }

  private addRangeTransition(from: number, to: number, range: CharRange): void {
    this.states[from]!.transitions.push({ to, range });
  }

  private buildNode(node: RegexNode): NfaFragment {
    switch (node.kind) {
      case 'empty': {
        const start = this.newState().id;
        const accept = this.newState().id;
        this.addEpsilon(start, accept);
        return { start, accept };
      }
      case 'literal': {
        const start = this.newState().id;
        const accept = this.newState().id;
        const code = node.value.codePointAt(0) ?? 0;
        this.addRangeTransition(start, accept, { from: code, to: code });
        return { start, accept };
      }
      case 'charClass': {
        const start = this.newState().id;
        const accept = this.newState().id;
        for (const range of node.ranges) {
          this.addRangeTransition(start, accept, range);
        }
        return { start, accept };
      }
      case 'concat': {
        const left = this.buildNode(node.left);
        const right = this.buildNode(node.right);
        this.addEpsilon(left.accept, right.start);
        return { start: left.start, accept: right.accept };
      }
      case 'alt': {
        const start = this.newState().id;
        const accept = this.newState().id;
        const left = this.buildNode(node.left);
        const right = this.buildNode(node.right);
        this.addEpsilon(start, left.start);
        this.addEpsilon(start, right.start);
        this.addEpsilon(left.accept, accept);
        this.addEpsilon(right.accept, accept);
        return { start, accept };
      }
      case 'quantifier': {
        return this.buildQuantifier(node.child, node.min, node.max);
      }
      default:
        throw new Error('Unsupported regex AST node');
    }
  }

  private buildQuantifier(
    child: RegexNode,
    min: number,
    max: number | null
  ): NfaFragment {
    if (max !== null && max < min) {
      throw new Error('Invalid quantifier bounds');
    }

    if (min === 0 && max === 1) {
      // ?
      const start = this.newState().id;
      const accept = this.newState().id;
      const base = this.buildNode(child);
      this.addEpsilon(start, base.start);
      this.addEpsilon(start, accept);
      this.addEpsilon(base.accept, accept);
      return { start, accept };
    }

    if (min === 0 && max === null) {
      // *
      const start = this.newState().id;
      const accept = this.newState().id;
      const base = this.buildNode(child);
      this.addEpsilon(start, base.start);
      this.addEpsilon(start, accept);
      this.addEpsilon(base.accept, base.start);
      this.addEpsilon(base.accept, accept);
      return { start, accept };
    }

    if (min === 1 && max === null) {
      // +
      const start = this.newState().id;
      const accept = this.newState().id;
      const base = this.buildNode(child);
      this.addEpsilon(start, base.start);
      this.addEpsilon(base.accept, base.start);
      this.addEpsilon(base.accept, accept);
      return { start, accept };
    }

    // Bounded {m,n}
    // Unroll min occurrences, then add up to (max - min) optional copies.
    let overallStart: number;
    let overallAccept: number;

    if (min === 0) {
      const start = this.newState().id;
      const accept = this.newState().id;
      this.addEpsilon(start, accept);
      overallStart = start;
      overallAccept = accept;
    } else {
      const first = this.buildNode(child);
      overallStart = first.start;
      overallAccept = first.accept;
      for (let i = 1; i < min; i += 1) {
        const next = this.buildNode(child);
        this.addEpsilon(overallAccept, next.start);
        overallAccept = next.accept;
      }
    }

    if (max === null) {
      // {m,} => min fixed, then '*' on the base fragment
      const loop = this.buildNode(child);
      this.addEpsilon(overallAccept, loop.start);
      this.addEpsilon(loop.accept, loop.start);
      this.addEpsilon(loop.accept, overallAccept);
      return { start: overallStart, accept: overallAccept };
    }

    const extra = max - min;
    let tailAccept = overallAccept;
    for (let i = 0; i < extra; i += 1) {
      const opt = this.buildNode(child);
      const newTail = this.newState().id;
      // Either skip this optional copy or consume it.
      this.addEpsilon(tailAccept, opt.start);
      this.addEpsilon(tailAccept, newTail);
      this.addEpsilon(opt.accept, newTail);
      tailAccept = newTail;
    }

    return { start: overallStart, accept: tailAccept };
  }
}

function stripAnchors(patternSource: string): string {
  let start = 0;
  let end = patternSource.length;
  if (end > 0 && patternSource[0] === '^') {
    start = 1;
  }
  if (end - start > 0 && patternSource[end - 1] === '$') {
    end -= 1;
  }
  return patternSource.slice(start, end);
}

/**
 * Build a Thompson NFA for the given regex pattern.
 *
 * The pattern is assumed to be either already anchored-safe (^...$) or
 * a subset thereof; top-level ^ and $ anchors are stripped before parsing.
 */
export function buildThompsonNfa(
  patternSource: string,
  options?: NfaBuildOptions
): NfaBuildResult {
  const body = stripAnchors(patternSource);
  const parser = new RegexParser(body);
  const ast = parser.parse();
  const builder = new ThompsonBuilder(options);
  return builder.build(ast);
}
