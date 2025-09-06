# FoundryData MVP (v0.1) Limitations

This document lists the known limitations and unsupported features in the MVP release.

## JSON Schema Features - Support Status

### ✅ Fully Supported Keywords  
- **`const`** - Constant value validation for all primitive types
- **`multipleOf`** - Number divisibility validation (Draft-07+ compliance)
- **`prefixItems`** - Tuple validation (Draft 2019-09/2020-12)
- **`$ref`** - Schema references with full resolution support
- **`$recursiveRef`**/`$recursiveAnchor`** - Recursive references (Draft 2019-09)
- **`$dynamicRef`**/`$dynamicAnchor`** - Dynamic references (Draft 2020-12)
- **`definitions`** - Legacy definitions support (Draft-04/06, use `$defs` instead)
- **`$defs`** - Modern definitions support (Draft 2019-09+)
- **`additionalProperties`** - Boolean constraint and edge case generation
- **`dependencies`**/**`dependentRequired`** - Property dependencies

### ⚠️ Partially Supported Keywords
- **`pattern`** - Basic regex patterns with ReDoS protection
  - ✅ Simple patterns like `^[A-Z]{3}-[0-9]{4}$`, `^[a-z0-9-]+$`  
  - ❌ Complex patterns with high ReDoS risk or excessive length
  - ❌ Advanced regex features (lookaheads, backreferences)
- **`readOnly`**/**`writeOnly`** - Annotation-only (no generation impact)
- **`contentEncoding`**/**`contentMediaType`** - Annotation-only (no validation)

### ❌ Keywords Not Supported  
- **Schema Composition**: `allOf`, `anyOf`, `oneOf`, `not`
- **Conditional Application**: `if`, `then`, `else`
- **Advanced Property Validation**: `patternProperties`, `propertyNames`, `dependentSchemas`
- **Array Contains**: `contains`, `minContains`, `maxContains`, `additionalItems`
- **Unevaluated Keywords**: `unevaluatedItems`, `unevaluatedProperties` (Draft 2019-09+)
- **Content Validation**: `contentSchema`
- **Legacy Extensions**: `$data` references

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
- Flatten nested objects beyond depth 2
- Replace schema composition with single schemas
- Remove conditional logic (`if`/`then`/`else`)

## Future Releases

### v0.2.0 (Planned)
- Complex pattern/regex support with advanced features
- AdditionalItems validation
- Better tuple array support

### v0.3.0 (Planned)
- Contains validation
- Schema composition (allOf, anyOf, oneOf)
- Deeper nested objects (beyond depth 2)
- More string formats

### v1.0 (Planned)
- Full nesting support
- Conditional schemas (if/then/else)
- Advanced property validation patterns

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
