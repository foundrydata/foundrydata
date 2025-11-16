import type Ajv from 'ajv';
import type { ValidateFunction } from 'ajv';
import fc from 'fast-check';

import {
  compileOneOfBranchValidators,
  composeEffective,
  createSourceAjvForSchema,
} from '../unit/test-helpers.js';
import { BENCH_SEEDS } from './bench-profiles.js';

export const pipelineSeedArbitrary = fc.integer({ min: 1, max: 10_000 });
export const benchSeedArbitrary = fc.constantFrom(...BENCH_SEEDS);

const oneOfExclusivitySchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  unevaluatedProperties: false,
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        variant: { const: 'even' },
        value: { type: 'integer', multipleOf: 2 },
      },
      required: ['variant', 'value'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        variant: { const: 'odd' },
        value: {
          type: 'integer',
          not: { multipleOf: 2 },
        },
      },
      required: ['variant', 'value'],
    },
  ],
} as const;

const exclusivityAjv = createSourceAjvForSchema(oneOfExclusivitySchema);
const exclusivityBranchValidators = compileOneOfBranchValidators(
  exclusivityAjv,
  oneOfExclusivitySchema as Record<string, unknown>
);

export interface OneOfExclusivityFixture {
  schema: typeof oneOfExclusivitySchema;
  ajv: Ajv;
  branchValidators: ValidateFunction[];
  seedArbitrary: typeof pipelineSeedArbitrary;
}

export const oneOfExclusivityFixture: OneOfExclusivityFixture = {
  schema: oneOfExclusivitySchema,
  ajv: exclusivityAjv,
  branchValidators: exclusivityBranchValidators,
  seedArbitrary: pipelineSeedArbitrary,
};

const mustCoverSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  propertyNames: { enum: ['anchor', 'guarded', 'aux'] },
  required: ['anchor'],
  dependentRequired: {
    anchor: ['guarded'],
  },
  properties: {
    anchor: { const: 'alpha' },
    guarded: { type: 'string', minLength: 1 },
    aux: { type: 'number', minimum: 0 },
  },
} as const;

const mustCoverAjv = createSourceAjvForSchema(mustCoverSchema);
const mustCoverCoverage =
  composeEffective(mustCoverSchema).canonical.coverageIndex.get('') ??
  undefined;
const enumeratedMustCover = new Set<string>(
  mustCoverCoverage?.enumerate?.() ?? []
);

export interface MustCoverFixture {
  schema: typeof mustCoverSchema;
  ajv: Ajv;
  enumeratedMustCover: ReadonlySet<string>;
  seedArbitrary: typeof pipelineSeedArbitrary;
}

export const mustCoverFixture: MustCoverFixture = {
  schema: mustCoverSchema,
  ajv: mustCoverAjv,
  enumeratedMustCover,
  seedArbitrary: pipelineSeedArbitrary,
};
