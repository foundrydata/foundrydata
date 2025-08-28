/**
 * ================================================================================
 * AJV FACTORY - FOUNDRYDATA TESTING v2.1
 *
 * Multi-draft JSON Schema validation with cached AJV instances.
 * Aligned with Formats Policy v2.2 for deterministic behavior.
 *
 * See: docs/tests/foundrydata-complete-testing-guide-en.ts.txt
 * ================================================================================
 */

import Ajv, { type AnySchema } from 'ajv';
import Ajv2019 from 'ajv/dist/2019.js';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import draft2019Formats from 'ajv-formats-draft2019';

export type JsonSchemaDraft = 'draft-07' | '2019-09' | '2020-12';

// Formats that MUST remain Annotative per Policy v2.2
const ANNOTATIVE_FORMATS: readonly string[] = [
  'json-pointer',
  'relative-json-pointer',
  'uri-template',
];

// Cache compiled validators
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validatorCache = new WeakMap<object, any>();

function createAjvInstance(draft: JsonSchemaDraft): Ajv {
  const baseOptions = {
    strict: true,
    allErrors: true,
    verbose: true,
    strictSchema: true,
    strictNumbers: true,
    strictRequired: true,
    allowUnionTypes: false, // Avoid non-standard "string|number" syntax
    validateFormats: true, // Assert formats (not just annotate)
  } as const;

  switch (draft) {
    case '2020-12':
      return new Ajv2020(baseOptions);
    case '2019-09':
      return new Ajv2019(baseOptions);
    case 'draft-07':
    default:
      return new Ajv(baseOptions);
  }
}

function configureFormats(ajv: Ajv, draft: JsonSchemaDraft): void {
  // Add standard formats
  addFormats(ajv);

  // Add draft-specific formats
  if (draft !== 'draft-07') {
    draft2019Formats(ajv);
  }

  // Policy v2.2 alignment: downgrade specific formats to Annotative
  const once = new Set<string>();
  for (const name of ANNOTATIVE_FORMATS) {
    ajv.addFormat(name, {
      type: 'string',
      validate: () => true,
    });
    if (!once.has(name)) {
      console.warn(
        `[Formats Policy v2.2] Downgraded format to annotative: ${name}`
      );
      once.add(name);
    }
  }
}

function addCachingSupport(ajv: Ajv): void {
  const originalCompile = ajv.compile.bind(ajv);
  ajv.compile = function (schema: AnySchema) {
    if (validatorCache.has(schema as object)) {
      return validatorCache.get(schema as object);
    }
    const validator = originalCompile(schema);
    validatorCache.set(schema as object, validator);
    return validator;
  };
}

export function createAjv(draft: JsonSchemaDraft = '2020-12'): Ajv {
  const ajv = createAjvInstance(draft);
  configureFormats(ajv, draft);
  addCachingSupport(ajv);

  // Expose helper for policy summary
  (
    ajv as { __printFormatsPolicySummary?: () => void }
  ).__printFormatsPolicySummary = () => {
    const asserted = [
      'date-time',
      'date',
      'time',
      'duration',
      'email',
      'hostname',
      'idn-email',
      'idn-hostname',
      'ipv4',
      'ipv6',
      'uri',
      'uri-reference',
      'iri',
      'iri-reference',
      'regex',
      'uuid',
    ].filter(
      (f) => (ANNOTATIVE_FORMATS as readonly string[]).indexOf(f) === -1
    );
    // eslint-disable-next-line no-console
    console.log('[Formats Policy v2.2] Asserted formats:', asserted.join(', '));
    // eslint-disable-next-line no-console
    console.log(
      '[Formats Policy v2.2] Annotative formats:',
      ANNOTATIVE_FORMATS.join(', ')
    );
  };

  return ajv;
}

// Singleton instance based on environment
let ajvInstance: Ajv | null = null;

export function getAjv(): Ajv {
  if (!ajvInstance) {
    const draft = (process.env.SCHEMA_DRAFT as JsonSchemaDraft) || '2020-12';
    ajvInstance = createAjv(draft);
    // Print the policy summary once per process for traceability
    const ajvWithHelper = ajvInstance as {
      __printFormatsPolicySummary?: () => void;
    };
    if (ajvWithHelper.__printFormatsPolicySummary) {
      ajvWithHelper.__printFormatsPolicySummary();
    }
  }
  return ajvInstance;
}
