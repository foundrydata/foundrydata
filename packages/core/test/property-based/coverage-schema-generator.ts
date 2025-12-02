import type { CoverageDimension } from '@foundrydata/shared';

/**
 * Very small combinatorial generator for JSON Schemas that exercise
 * a few coverage-relevant motifs (oneOf, anyOf, enums, AP:false, arrays).
 *
 * This is intentionally minimal: it is meant to be evolved into a proper
 * property-based generator over time.
 */

export type GeneratedSchemaKind =
  | 'oneOf-enum'
  | 'anyOf-object'
  | 'apfalse-object'
  | 'array-contains'
  | 'conditional-if-then';

export interface GeneratedSchemaCase {
  id: string;
  kind: GeneratedSchemaKind;
  schema: unknown;
  dimensions: CoverageDimension[];
}

// eslint-disable-next-line max-lines-per-function, complexity
export function* generateCoverageSchemas(): Generator<GeneratedSchemaCase> {
  const dimsBranchesEnum: CoverageDimension[] = ['branches', 'enum'];
  const dimsStructure: CoverageDimension[] = ['structure'];

  // oneOf + enum variations (2 and 3 branches)
  const oneOfBranchCounts = [2, 3] as const;
  for (const count of oneOfBranchCounts) {
    const branches = [];
    for (let index = 0; index < count; index += 1) {
      const label = index === 0 ? 'left' : index === 1 ? 'right' : 'center';
      branches.push({
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { const: label },
          tag: { enum: ['A', 'B'] },
        },
        required: ['kind', 'tag'],
      });
    }
    yield {
      id: count === 2 ? 'oneOf-enum' : `oneOf-enum-${count}branches`,
      kind: 'oneOf-enum',
      dimensions: dimsBranchesEnum,
      schema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        oneOf: branches,
      } as const,
    };
  }

  // anyOf variations (2 and 3 branches)
  const anyOfVariants = [2, 3] as const;
  for (const count of anyOfVariants) {
    const branches = [];
    for (let index = 0; index < count; index += 1) {
      branches.push({
        type: 'object',
        properties: {
          flag: { const: index % 2 === 0 },
        },
      });
    }
    yield {
      id: count === 2 ? 'anyOf-object' : `anyOf-object-${count}branches`,
      kind: 'anyOf-object',
      dimensions: dimsBranchesEnum,
      schema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        anyOf: branches,
      } as const,
    };
  }

  // AP:false variations: with and without patternProperties
  const apFalseVariants = [
    {
      id: 'apfalse-object',
      withPattern: true,
    },
    {
      id: 'apfalse-object-nopattern',
      withPattern: false,
    },
  ] as const;

  for (const variant of apFalseVariants) {
    const schema: Record<string, unknown> & {
      patternProperties?: Record<string, { type: 'string' }>;
    } = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        a: { type: 'string' },
        b: { type: 'integer' },
      },
    };
    if (variant.withPattern) {
      schema.patternProperties = {
        '^x-': { type: 'string' },
      };
    }
    yield {
      id: variant.id,
      kind: 'apfalse-object',
      dimensions: dimsStructure,
      schema,
    };
  }

  // Array + contains variations: minContains 1 or 2, different consts
  const containsValues = [1, 2] as const;
  for (const value of containsValues) {
    yield {
      id: value === 1 ? 'array-contains' : `array-contains-${value}`,
      kind: 'array-contains',
      dimensions: dimsStructure,
      schema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { type: 'integer', minimum: 0 },
            contains: { const: value },
            minContains: value,
          },
        },
        required: ['items'],
      } as const,
    };
  }

  // Conditional if/then variations: with and without else
  const conditionalVariants = [false, true] as const;
  for (const hasElse of conditionalVariants) {
    const base: {
      $schema: string;
      type: 'object';
      properties: {
        kind: { enum: ['A', 'B'] };
        value: { type: 'integer' };
      };
      required: string[];
      if: {
        properties: { kind: { const: 'A' } };
        required: string[];
      };
      then: {
        properties: { value: { minimum: number } };
      };
      else?: {
        properties: { value: { maximum: number } };
      };
    } = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        kind: { enum: ['A', 'B'] },
        value: { type: 'integer' },
      },
      required: ['kind'],
      if: {
        properties: { kind: { const: 'A' } },
        required: ['kind'],
      },
      then: {
        properties: { value: { minimum: 0 } },
      },
    };
    if (hasElse) {
      base.else = {
        properties: { value: { maximum: 10 } },
      };
    }
    yield {
      id: hasElse ? 'conditional-if-then-else' : 'conditional-if-then',
      kind: 'conditional-if-then',
      dimensions: dimsStructure,
      schema: base,
    };
  }
}
