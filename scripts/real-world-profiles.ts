import type { IterationConfig, BenchProfile } from './bench-types.js';
import { DEFAULT_ITERATIONS } from './bench-config.js';

interface RealWorldProfileDefinition {
  id: string;
  label: string;
  schemaFile: string;
  generateCount: number;
  iterations?: IterationConfig;
}

const REAL_WORLD_PROFILE_DEFINITIONS: readonly RealWorldProfileDefinition[] = [
  {
    id: 'npm-package',
    label: 'npm package manifest (SchemaStore)',
    schemaFile: 'real-world/npm-package.schema.json',
    generateCount: 32,
  },
  {
    id: 'tsconfig',
    label: 'tsconfig (SchemaStore)',
    schemaFile: 'real-world/tsconfig.schema.json',
    generateCount: 24,
  },
  {
    id: 'github-workflow',
    label: 'GitHub Actions workflow (SchemaStore)',
    schemaFile: 'real-world/github-workflow.schema.json',
    generateCount: 12,
  },
  {
    id: 'openapi-3.1',
    label: 'OpenAPI 3.1 specification schema',
    schemaFile: 'real-world/openapi-3.1.schema.json',
    generateCount: 6,
  },
  {
    id: 'asyncapi-3.0',
    label: 'AsyncAPI 3.0 specification schema',
    schemaFile: 'real-world/asyncapi-3.0.schema.json',
    generateCount: 6,
  },
  {
    id: 'cloudevents',
    label: 'CloudEvents JSON data schema',
    schemaFile: 'real-world/cloudevents.schema.json',
    generateCount: 16,
  },
] as const;

function makeSchemaUrl(filename: string): URL {
  return new URL(`../profiles/${filename}`, import.meta.url);
}

export const realWorldProfiles: readonly BenchProfile[] =
  REAL_WORLD_PROFILE_DEFINITIONS.map((definition) => ({
    id: definition.id,
    label: definition.label,
    schemaPath: makeSchemaUrl(definition.schemaFile),
    generateCount: definition.generateCount,
    iterations: definition.iterations ?? DEFAULT_ITERATIONS,
  }));
