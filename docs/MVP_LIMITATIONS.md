# FoundryData MVP (v0.1) Limitations

This document lists the known limitations and unsupported features in the MVP release.

## JSON Schema Features Supported with Limitations

### Partially Supported Keywords
- **`pattern`** - Basic regex patterns supported with ReDoS protection and complexity limits
  - ✅ Simple patterns like `^[A-Z]{3}-[0-9]{4}$`, `^[a-z0-9-]+$`
  - ❌ Complex patterns with high ReDoS risk or excessive length
  - ❌ Patterns using advanced regex features (lookaheads, backreferences)

## JSON Schema Features Not Supported

### Keywords Not Supported
- **`multipleOf`** - Number divisibility constraint (will be in v0.2.0)
- **`additionalItems`** - Additional items validation (will be in v0.2.0)
- **`contains`** - Array contains validation (will be in v0.3.0)
- **`const`** - Constant values (partial support, may work but not guaranteed)
- **`prefixItems`** - Modern draft tuple validation (2019-09/2020-12)
- **`unevaluatedItems`** - Unevaluated items validation (2019-09/2020-12)
- **`$ref`** - Schema references
- **`allOf`**, **`anyOf`**, **`oneOf`**, **`not`** - Schema composition

### Tuple Arrays
- Arrays with `items` as an array (tuple validation) are not fully supported
- Use single schema for `items` instead of array of schemas

### Nested Objects
- ✅ **Supported**: Objects nested within object properties up to **depth 2**
- ❌ **Not supported**: Nesting beyond depth 2 (will be expanded in future versions)
- **Example supported**:
  ```json
  {
    "type": "object",
    "properties": {
      "user": {
        "type": "object", 
        "properties": {
          "profile": {
            "type": "object",
            "properties": {
              "name": {"type": "string"}
            }
          }
        }
      }
    }
  }
  ```

### String Formats Not Supported
- `uri`, `uri-reference`, `url` (except basic URL generation)
- `hostname`
- `ipv4`, `ipv6`
- `regex`
- `json-pointer`, `relative-json-pointer`

## Parser Limitations

### Semantic Validation
The parser only validates structural validity, not semantic correctness:
- Negative `minLength` or `minItems` are accepted (will fail at generation)
- `minimum > maximum` is accepted (will fail at generation)
- Invalid regex patterns are rejected with syntax validation
- Complex regex patterns are rejected for ReDoS protection

## Test Infrastructure Issues

### Memory Issues with Multi-Draft Tests
- Running multiple integration test files together causes memory exhaustion
- Workaround: Run tests sequentially using `npm run test:integration`

### Worker Process Crashes
- Vitest worker processes crash when running certain test combinations
- Related to test discovery phase, not execution
- Individual tests pass when run with `-t` flag

## Workarounds

### Running Integration Tests
Use the provided script instead of running all tests together:
```bash
npm run test:integration  # Runs tests sequentially
# Or manually:
./test/run-integration-tests.sh
```

### Testing Schemas with Unsupported Features
Remove or replace unsupported features before testing:
- Simplify complex `pattern` constraints or replace with `format`
- Remove `multipleOf` constraints
- Flatten nested objects
- Use single schema instead of tuple arrays

## Future Releases

### v0.2.0 (Planned)
- Complex pattern/regex support with advanced features
- MultipleOf constraint
- AdditionalItems validation
- Better tuple array support

### v0.3.0 (Planned)
- Contains validation
- Deeper nested objects (beyond depth 2)
- More string formats

### v1.0 (Planned)
- Full nesting support
- Schema composition (allOf, anyOf, oneOf)
- Schema references ($ref)

## Using the Limitations Registry

The registry is available from `@foundrydata/core` to help you detect feature availability, suggest workarounds, and enrich errors for better presentation.

### Check support by version

```ts
import { isSupported, CURRENT_VERSION } from '@foundrydata/core';

// Example: is regex pattern supported in current version?
const regexOk = isSupported('regexPatterns', CURRENT_VERSION); // true (basic) in v0.1.0, true (full) in v0.2.0
```

### Retrieve limitation details

```ts
import { getLimitation } from '@foundrydata/core';

const lim = getLimitation('schemaComposition');
// lim?.availableIn => '1.0.0'
// lim?.workaround => 'Manually merge constraints from allOf/anyOf/oneOf into a single schema.'
// lim?.docsAnchor => 'keywords-not-supported'
```

### Enrich an error with limitation context

```ts
import { ErrorCode, enrichErrorWithLimitation } from '@foundrydata/core';
import { SchemaError } from '@foundrydata/core/types';

// Create an error at the emission point
let error = new SchemaError({
  message: 'Nested objects are not supported in the current version',
  errorCode: ErrorCode.NESTED_OBJECTS_NOT_SUPPORTED,
  context: { schemaPath: '#/properties/address' },
});

// Enrich it with registry data (workaround, documentation link, ETA)
error = enrichErrorWithLimitation(error, 'nestedObjects');

// Now presenters and loggers can surface richer info
// error.suggestions[0] includes a flattening workaround
// error.documentation links to the relevant doc section
// error.availableIn provides the planned release version
```

### Suggestion Helpers

The core exposes small, pure helpers to surface actionable suggestions and workarounds tied to this registry.

```ts
import {
  didYouMean,
  getAlternative,
  proposeSchemaFix,
  getWorkaround,
} from '@foundrydata/core';
import { SchemaError } from '@foundrydata/core/types';

// 1) Typo assistance (e.g., unknown format names)
didYouMean('stirng', ['string', 'number', 'boolean']); // ['string']

// 2) High-level alternative for unsupported features
const alt = getAlternative('regexPatterns');
// alt => { workaround, example, documentation }

// 3) Schema fix proposal from an error enriched with limitationKey
//    (context.schemaPath is required by SchemaError)
const fix = proposeSchemaFix(
  new SchemaError({
    message: 'Nested objects not supported',
    context: { schemaPath: '#/properties/address', path: '/properties/address', limitationKey: 'nestedObjects' },
  })
);
// fix => { path: '/properties/address', explanation, example }

// 4) Direct workaround lookup by key
const wk = getWorkaround('nestedObjects');
// wk => { description, example, availableIn }
```

These helpers are deliberately simple in MVP and rely on the Limitations Registry to keep guidance consistent with product documentation and release timelines.
