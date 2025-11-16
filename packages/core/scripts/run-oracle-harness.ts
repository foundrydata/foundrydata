/* eslint-disable max-lines-per-function */
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  apFalseUnsafePatternSchema,
  apFalseSafeFallbackSchema,
  externalRefSchema,
  dependentAllOfCoverageSchema,
  exclusivityOneOfSchema,
  propertyNamesPatternSchema,
  propertyNamesRawEnumSchema,
} from '../src/pipeline/__fixtures__/integration-schemas.js';
import {
  assertOracleInvariants,
  runOracleHarness,
} from '../src/pipeline/oracle-harness.js';

function writeLine(message: string): void {
  process.stdout.write(`${message}\n`);
}

async function main(): Promise<void> {
  const seed = 37;
  const count = 3;

  writeLine(
    `FoundryData AJV-oracle harness — cwd: ${process.cwd()} · seed=${seed} · count=${count}`
  );

  const strictReport = await runOracleHarness({
    schemas: [
      {
        id: 'dependent-allOf-coverage',
        schema: dependentAllOfCoverageSchema,
      },
      {
        id: 'apFalse-unsafe',
        schema: apFalseUnsafePatternSchema,
      },
      {
        id: 'apFalse-safe-fallback',
        schema: apFalseSafeFallbackSchema,
      },
      {
        id: 'exclusivity-oneOf',
        schema: exclusivityOneOfSchema,
      },
      {
        id: 'propertyNames-pattern',
        schema: propertyNamesPatternSchema,
      },
      {
        id: 'propertyNames-raw-enum',
        schema: propertyNamesRawEnumSchema,
      },
      {
        id: 'external-ref',
        schema: externalRefSchema,
      },
    ],
    mode: 'strict',
    seed,
    count,
    validateFormats: false,
  });

  writeLine('== Strict mode summary ==');
  for (const run of strictReport.runs) {
    const unsatCodes =
      run.unsatDiagnostics.length > 0
        ? Array.from(new Set(run.unsatDiagnostics.map((d) => d.code))).join(',')
        : 'none';
    const invalidCount = run.invalidItems.length;
    writeLine(
      `- [${run.schemaId}] outcome=${run.outcome} items=${run.generatedItems.length} invalid=${invalidCount} unsatDiagnostics=${unsatCodes}`
    );
  }

  const laxReport = await runOracleHarness({
    schemas: [{ id: 'external-ref-lax', schema: externalRefSchema }],
    mode: 'lax',
    seed,
    count,
    validateFormats: false,
  });

  writeLine('== Lax mode external $ref summary ==');
  for (const run of laxReport.runs) {
    const skipped = run.pipelineResult.artifacts.validation?.skippedValidation
      ? 'yes'
      : 'no';
    const unsatCodes =
      run.unsatDiagnostics.length > 0
        ? Array.from(new Set(run.unsatDiagnostics.map((d) => d.code))).join(',')
        : 'none';
    writeLine(
      `- [${run.schemaId}] outcome=${run.outcome} items=${run.generatedItems.length} skippedValidation=${skipped} unsatDiagnostics=${unsatCodes}`
    );
  }

  try {
    assertOracleInvariants(strictReport);
    assertOracleInvariants(laxReport);
    writeLine('✅ AJV-oracle invariants satisfied for all harness runs');
  } catch (error) {
    console.error('❌ AJV-oracle invariant violation detected:', error);
    process.exitCode = 1;
  }
}

const executedDirectly =
  typeof process.argv[1] === 'string' &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (executedDirectly) {
  main().catch((error) => {
    console.error('AJV-oracle harness script failed:', error);
    process.exitCode = 1;
  });
}
