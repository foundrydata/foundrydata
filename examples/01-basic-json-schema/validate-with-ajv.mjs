import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const [,, schemaPath, dataPath, expectedCountRaw] = process.argv;
const expectedCount = Number(expectedCountRaw);

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);

const validate = ajv.compile(schema);

let validCount = 0;
let firstError = null;

if (!Array.isArray(data)) {
  throw new Error('Expected generated data to be a JSON array');
}

for (const item of data) {
  const valid = validate(item);
  if (valid) {
    validCount += 1;
  } else if (!firstError) {
    firstError = validate.errors || null;
  }
}

if (validCount === data.length && (Number.isNaN(expectedCount) || validCount === expectedCount)) {
  console.error(`✅ ${validCount}/${data.length} items valid against ${schemaPath}`);
} else {
  console.error(`❌ Validation failed: ${validCount}/${data.length} items valid`);
  if (firstError) {
    console.error('First AJV error:', JSON.stringify(firstError, null, 2));
  }
  process.exit(1);
}
