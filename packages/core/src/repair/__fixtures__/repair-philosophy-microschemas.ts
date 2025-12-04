export const repairPhilosophyMicroSchemas = {
  /**
   * Tier-1 only motifs: numeric clamp, string minLength, uniqueItems.
   * These schemas are intended to exercise non-structural, local
   * repairs without involving G_valid or structuralKeywords.
   */
  tier1: {
    stringMinLength: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'string',
      minLength: 3,
    } as const,
    numericClamp: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'number',
      minimum: 0,
      maximum: 10,
    } as const,
    uniqueItems: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'array',
      items: { type: 'integer' },
      uniqueItems: true,
      maxItems: 2,
    } as const,
  },

  /**
   * Tier-2 motifs outside G_valid: required add, contains witness append,
   * AP:false cleanup. These are intended to be exercised in non-G_valid
   * contexts so that structural repairs remain allowed within policy.
   */
  tier2NonGValid: {
    requiredAddObject: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'integer', minimum: 0 },
        title: { type: 'string', minLength: 1 },
      },
      required: ['id'],
    } as const,
    containsWitnessArray: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'array',
      items: { type: 'integer', minimum: 0 },
      contains: { const: 1 },
      minItems: 1,
    } as const,
    apFalseCleanupObject: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      properties: {
        anchor: { const: 'alpha' },
        fallback: { type: 'string', minLength: 1 },
      },
      required: ['anchor'],
    } as const,
  },

  /**
   * G_valid structural keyword motifs: simple objects that will be
   * classified as G_valid and on which structural actions (required,
   * minItems, AP:false cleanup) must be blocked or flagged rather
   * than treated as normal success.
   */
  gValidStructural: {
    simpleObject: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        id: { type: 'integer', minimum: 0 },
        title: { type: 'string', minLength: 1 },
      },
      required: ['id', 'title'],
    } as const,
  },

  /**
   * UNSAT/stagnation motifs: schemas where Repair cannot reach a fully
   * valid instance under reasonable attempts, used together with Score(x)
   * and bailOnUnsatAfter to observe UNSAT_BUDGET_EXHAUSTED behavior.
   */
  unsat: {
    integerConstVsMultipleOf: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'integer',
      multipleOf: 2,
      const: 3,
    } as const,
  },
} as const;

export type RepairPhilosophyMicroSchemas = typeof repairPhilosophyMicroSchemas;
