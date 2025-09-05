# FoundryData MVP (v0.1) Limitations

This document lists the known limitations and unsupported features in the MVP release.

## JSON Schema Features Not Supported

### Keywords Not Supported
- **`pattern`** - Regular expression pattern matching (will be in v0.2.0)
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
- Objects nested within object properties are not supported in MVP
- Maximum nesting depth: 1 level

### String Formats Not Supported
- `uri`, `uri-reference`, `url` (except basic URL generation)
- `hostname`
- `ipv4`, `ipv6`
- `regex`
- `json-pointer`, `relative-json-pointer`
- Custom regex patterns

## Parser Limitations

### Semantic Validation
The parser only validates structural validity, not semantic correctness:
- Negative `minLength` or `minItems` are accepted (will fail at generation)
- `minimum > maximum` is accepted (will fail at generation)
- Invalid regex patterns are rejected only because patterns aren't supported

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
- Replace `pattern` with `format` constraints
- Remove `multipleOf` constraints
- Flatten nested objects
- Use single schema instead of tuple arrays

## Future Releases

### v0.2.0 (Planned)
- Pattern/regex support
- MultipleOf constraint
- AdditionalItems validation
- Better tuple array support

### v0.3.0 (Planned)
- Contains validation
- Nested objects (1 level)
- More string formats

### v1.0 (Planned)
- Full nesting support
- Schema composition (allOf, anyOf, oneOf)
- Schema references ($ref)