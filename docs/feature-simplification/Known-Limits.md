# Known Limitations Documentation

Documentation of current limitations and partial feature support in FoundryData, with clear explanations of constraints and workarounds.

## 🔗 Dynamic Refs {#dynamic-refs}

### Invariants
- **Pass-Through Preservation**: `$dynamicRef`, `$recursiveRef`, and `$dynamicAnchor` preserved without resolution
- **Conservative Generation**: Generation proceeds safely without resolving dynamic links
- **AJV Authority**: Final validation by AJV handles dynamic resolution correctly
- **Clear Documentation**: Dynamic reference presence noted in diagnostics

### Algorithm
1. **Detection** - Identify `$dynamicRef`, `$recursiveRef`, `$dynamicAnchor` keywords during parsing
2. **Preservation** - Keep dynamic references intact without attempting resolution
3. **Conservative Generation** - Generate based on immediate context without following dynamic links
4. **AJV Delegation** - Let AJV handle dynamic resolution during final validation

### Example
```javascript
// Schema with dynamic reference
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/tree",
  "$dynamicAnchor": "node",
  "type": "object",
  "properties": {
    "data": { "type": "string" },
    "children": {
      "type": "array", 
      "items": { "$dynamicRef": "#node" }  // Self-reference
    }
  }
}

// Generation: Creates objects with data + children array
// Limitation: Children array may be empty or contain non-recursive items
// AJV validates the full recursive structure correctly
```

### Diagnostics
- **Dynamic Presence**: `DYNAMIC_PRESENT` note when dynamic references detected
- **Resolution Skipped**: Clear indication that dynamic resolution was not attempted
- **Generation Strategy**: How conservative generation handled dynamic contexts

## 🎯 Pattern Approximations {#pattern-approximations}

### Invariants
- **Conservatively Safe**: Approximations err on the side of excluding rather than including
- **Anchored Preference**: Anchored patterns (^...$) receive more precise treatment
- **Must-Cover Compliance**: Pattern approximations respect `additionalProperties:false` must-cover requirements
- **Clear Diagnostics**: Approximation use clearly indicated in diagnostics

### Algorithm
1. **Pattern Analysis** - Analyze regex patterns for anchoring and complexity
2. **Anchored Handling** - Provide precise recognition for anchored patterns
3. **Complex Approximation** - Apply conservative approximations for complex patterns
4. **Must-Cover Integration** - Ensure approximations don't violate additionalProperties constraints

### Example
```javascript
// Well-handled: Anchored patterns
{
  "patternProperties": {
    "^user_[0-9]+$": { "type": "string" },    // Precise recognition
    "^admin_[a-z]+$": { "type": "string" }    // Precise recognition  
  },
  "additionalProperties": false
}

// Generated properties: "user_123", "admin_test" ✓

// Challenging: Complex patterns  
{
  "patternProperties": {
    "(?=.*[A-Z])(?=.*[0-9]).{8,}": { "type": "string" }  // Lookaheads
  },
  "additionalProperties": false
}

// Conservative approximation: May generate fewer properties than theoretically valid
// Diagnostic: "AP_FALSE_INTERSECTION_APPROX"
```

### Diagnostics
- **Pattern Classification**: How patterns are classified (anchored vs complex)
- **Approximation Applied**: `AP_FALSE_INTERSECTION_APPROX` when approximations used
- **Coverage Impact**: How approximations affect property generation

## 🌐 External Refs {#external-refs}

### Invariants
- **Strict Mode Default**: External `$ref` causes error by default in strict mode
- **Configurable Behavior**: `failFast.externalRefStrict` controls error vs warning vs ignore
- **Resolution Required**: External refs must be resolved before generation if strict enforcement disabled
- **Network Isolation**: No automatic network requests to resolve external references

### Algorithm
1. **External Detection** - Identify `$ref` pointing outside current document
2. **Policy Application** - Apply configured external reference policy
3. **Error/Warning Generation** - Produce appropriate diagnostic based on policy
4. **Resolution Check** - Verify external refs resolved if generation proceeds

### Example
```javascript
// Schema with external reference
{
  "properties": {
    "address": { "$ref": "https://schemas.example.com/address.json" }
  }
}

// Strict mode (default): Fails immediately
// Error: "External $ref not supported in strict mode"

// Warning mode: Proceeds if reference resolved
{
  failFast: { externalRefStrict: 'warn' }
}
// Warning: "External $ref detected, ensure resolution before generation"

// Ignore mode: Proceeds without checking
{
  failFast: { externalRefStrict: 'ignore' }  
}
// Proceeds, may fail during generation if unresolved
```

### Diagnostics
- **External Detection**: Count and locations of external references found
- **Policy Application**: Which external reference policy was applied
- **Resolution Status**: Whether external references were resolved before generation

## 🔄 Schema Composition Limitations {#schema-composition-limitations}

### Invariants
- **Partial Support**: Some composition patterns supported, others require workarounds
- **Clear Boundaries**: Well-defined list of supported vs unsupported composition features
- **Degradation Path**: Unsupported patterns trigger graceful degradation or clear errors
- **Future Roadmap**: Limitations documented with planned improvement timeline

### Algorithm
1. **Feature Detection** - Identify which composition features are used
2. **Support Check** - Verify if all features are supported in current version
3. **Degradation Application** - Apply appropriate fallback for unsupported features
4. **Documentation** - Clear error messages explaining limitations and alternatives

### Example
```javascript
// Supported: Simple allOf merging
{
  "allOf": [
    { "type": "object", "properties": { "name": { "type": "string" } } },
    { "type": "object", "properties": { "age": { "type": "number" } } }
  ]
}
// Works: Merges properties correctly

// Limited: Complex anyOf with overlapping constraints  
{
  "anyOf": [
    { "type": "string", "minLength": 5 },
    { "type": "string", "maxLength": 10 },
    { "type": "number" }
  ]
}
// Challenge: String branches overlap, may need branch selection refinement

// Unsupported: Deep not nesting
{
  "not": { "not": { "not": { "type": "string" } } }
}
// Error: "Maximum 'not' depth exceeded - use simpler logic"
```

### Diagnostics
- **Feature Usage**: Which composition features are present in schema
- **Support Status**: Clear indication of supported vs unsupported features
- **Alternative Suggestions**: Recommendations for unsupported patterns

## 📏 Format Validation Constraints {#format-validation-constraints}

### Invariants
- **Basic Format Support**: Core formats (uuid, email, date, date-time) fully supported
- **Advanced Format Limitations**: Complex formats (hostname, ipv4, ipv6) not yet implemented
- **Annotation Mode Default**: Unknown formats default to annotation-only behavior
- **Extensibility Path**: Clear mechanism for adding new format validators

### Algorithm
1. **Format Detection** - Identify format keywords in schema
2. **Support Check** - Verify if format is in supported set
3. **Validation Strategy** - Apply assertion or annotation mode based on support
4. **Generation Alignment** - Generate values that match supported format constraints

### Example
```javascript
// Supported formats - full validation
{
  "email": { "type": "string", "format": "email" },        // ✓ Generates valid emails
  "id": { "type": "string", "format": "uuid" },           // ✓ Generates valid UUIDs
  "created": { "type": "string", "format": "date-time" }  // ✓ Generates valid ISO dates
}

// Unsupported formats - annotation only
{
  "server": { "type": "string", "format": "hostname" },   // Generates generic strings
  "ip": { "type": "string", "format": "ipv4" }           // Generates generic strings
}
// Diagnostic: "FORMAT_ANNOTATION_ONLY - hostname, ipv4"
```

### Diagnostics
- **Format Support**: List of supported vs unsupported formats encountered
- **Validation Mode**: Whether each format uses assertion or annotation mode
- **Generation Strategy**: How unsupported formats are handled during generation

## 🔢 Numeric Precision Boundaries {#numeric-precision-boundaries}

### Invariants
- **Rational Arithmetic Limits**: Maximum bit lengths for rational arithmetic operations
- **Fallback Strategies**: Clear fallback to decimal or float when limits exceeded
- **Precision Documentation**: Explicit documentation of precision guarantees and limits
- **AJV Alignment**: Fallback precision matches AJV's validation tolerance

### Algorithm
1. **Precision Analysis** - Analyze numeric constraints for precision requirements
2. **Limit Checking** - Verify if operations stay within rational arithmetic limits
3. **Fallback Application** - Apply decimal or float fallback when limits exceeded
4. **Tolerance Alignment** - Ensure fallback precision matches AJV expectations

### Example
```javascript
// Within limits: Precise rational arithmetic
{
  "multipleOf": 0.1,  // 1/10 - precise rational representation
  "minimum": 0,
  "maximum": 100
}
// Generates: 0.1, 0.2, 0.3, ... (exact)

// Beyond limits: Large denominators
{
  "allOf": [
    { "multipleOf": 0.142857142857 },  // 1/7 (repeating decimal)
    { "multipleOf": 0.333333333333 }   // 1/3 (repeating decimal)
  ]
}
// LCM calculation exceeds bit limits
// Fallback: Decimal arithmetic with configurable precision
// Diagnostic: "RAT_FALLBACK_DECIMAL - bit limit exceeded"
```

### Diagnostics
- **Precision Requirements**: Analysis of numeric precision needs
- **Limit Triggers**: When rational arithmetic limits are exceeded
- **Fallback Performance**: Impact of fallback arithmetic on generation speed

## 🎭 Conditional Schema Constraints {#conditional-schema-constraints}

### Invariants
- **Conservative Handling**: If/then/else processed conservatively without full semantic analysis
- **Rewrite Limitations**: Complex conditional rewriting blocked by unevaluated properties
- **Repair Reliance**: Heavy reliance on repair phase for conditional constraint satisfaction
- **Clear Mode Separation**: Different conditional handling in strict vs lax modes

### Algorithm
1. **Conditional Detection** - Identify if/then/else patterns in schema
2. **Rewrite Analysis** - Check if safe conditional rewriting is possible
3. **Generation Strategy** - Apply if-aware generation hints when available
4. **Repair Dependency** - Rely on repair phase for complex conditional satisfaction

### Example
```javascript
// Simple conditional - handled reasonably well
{
  "if": { "properties": { "type": { "const": "user" } } },
  "then": { "required": ["email"] }
}
// If-aware generation: When type="user" is generated, includes email

// Complex conditional - challenging
{
  "properties": { "data": {} },
  "unevaluatedProperties": false,
  "if": { "properties": { "data": { "properties": { "internal": true } } } },
  "then": { "properties": { "metadata": { "type": "object" } } }
}
// Limitation: Unevaluated properties interact complexly with conditionals
// Strategy: Conservative generation + repair phase
```

### Diagnostics
- **Conditional Complexity**: Analysis of conditional patterns found
- **Rewrite Feasibility**: Whether safe conditional rewriting was possible
- **Repair Dependency**: How much repair phase was needed for conditionals