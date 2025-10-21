export const externalRefSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  allOf: [
    { $ref: 'https://example.com/external-supplier.schema.json' },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'integer', minimum: 0 },
        name: { type: 'string', minLength: 1 },
      },
      required: ['id', 'name'],
    },
  ],
} as const;

export const apFalseUnsafePatternSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  patternProperties: {
    '.*': { type: 'string' },
  },
} as const;

export const apFalseSafeFallbackSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  properties: {
    safe: { type: 'string', minLength: 1 },
    unsafe: { type: 'string', minLength: 1 },
  },
  required: ['safe'],
  patternProperties: {
    '.*': { type: 'string' },
  },
} as const;

export const exclusivityOneOfSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  oneOf: [
    { type: 'string', const: 'alpha' },
    { type: 'string', const: 'beta' },
  ],
} as const;

const baseConditionalBranches = {
  if: {
    properties: { kind: { const: 'alpha' } },
    required: ['kind'],
  },
  then: {
    required: ['alphaPayload'],
    allOf: [
      {
        if: {
          properties: { nestedFlag: { const: true } },
          required: ['nestedFlag'],
        },
        then: { required: ['nestedPayload'] },
        else: { required: ['nestedFallback'] },
      },
    ],
  },
  else: {
    required: ['betaPayload'],
  },
} as const;

export const conditionalSafeRewriteSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    kind: { enum: ['alpha', 'beta'] },
    alphaPayload: { type: 'string', minLength: 1 },
    betaPayload: { type: 'string', minLength: 1 },
    nestedFlag: { type: 'boolean' },
    nestedPayload: { type: 'string', minLength: 1 },
    nestedFallback: { type: 'string', minLength: 1 },
  },
  required: ['kind'],
  allOf: [{ ...baseConditionalBranches }],
} as const;

export const conditionalBlockedRewriteSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  unevaluatedProperties: false,
  properties: {
    kind: { enum: ['alpha', 'beta'] },
    alphaPayload: { type: 'string', minLength: 1 },
    betaPayload: { type: 'string', minLength: 1 },
    nestedFlag: { type: 'boolean' },
    nestedPayload: { type: 'string', minLength: 1 },
    nestedFallback: { type: 'string', minLength: 1 },
  },
  required: ['kind'],
  allOf: [{ ...baseConditionalBranches }],
} as const;

export const propertyNamesRawEnumSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  propertyNames: {
    enum: ['alpha', 'beta'],
  },
} as const;

export const propertyNamesRewriteEnumSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['alpha'],
  properties: {
    alpha: { type: 'string' },
    beta: { type: 'string' },
  },
  propertyNames: {
    enum: ['alpha', 'beta'],
  },
} as const;

export const patternCapsSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: { const: 'lock' },
  },
  patternProperties: {
    '^(?:foo)+$': { type: 'string', minLength: 3 },
  },
  minProperties: 2,
} as const;

export const scoreOnlyOneOfSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        tag: { const: 'left' },
      },
      required: ['tag'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        tag: { const: 'right' },
      },
      required: ['tag'],
    },
  ],
} as const;

export const propertyNamesPatternSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  propertyNames: {
    pattern: '^foo$',
  },
  minProperties: 1,
} as const;

export const dependentAllOfCoverageSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  allOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        anchor: { const: 'alpha' },
        fallback: { type: 'string', minLength: 1 },
        aux_0: { type: 'number', minimum: 0 },
      },
      required: ['anchor'],
      patternProperties: {
        '^(?:aux_1)$': { type: 'number', minimum: 0 },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      propertyNames: {
        enum: ['anchor', 'fallback', 'aux_0', 'aux_1'],
      },
      dependentSchemas: {
        anchor: {
          required: ['fallback', 'aux_0'],
        },
      },
    },
  ],
} as const;

export const apFalseRegexCapSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  patternProperties: {
    '^(?:foo)+$': { type: 'string', minLength: 3 },
  },
} as const;

export const repairOrigPathSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  properties: {
    anchor: { const: 'alpha' },
    fallback: { type: 'string', minLength: 1 },
  },
  required: ['anchor', 'fallback'],
} as const;

export const mustCoverGuardSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['alpha'],
  properties: {
    alpha: { type: 'string', const: 'ok' },
  },
  propertyNames: {
    enum: ['alpha', 'beta'],
  },
} as const;

export const scoreOnlyLargeOneOfSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: { tag: { const: 'left' } },
      required: ['tag'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: { tag: { const: 'middle' } },
      required: ['tag'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: { tag: { const: 'right' } },
      required: ['tag'],
    },
  ],
} as const;
