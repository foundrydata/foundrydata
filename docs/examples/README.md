# FoundryData Examples & Usage Guide

This directory contains real-world schema examples and usage patterns for FoundryData.

## 📋 Available Schemas

### ✅ Fully Supported (MVP v0.1)

| Schema | Description | Use Case |
|--------|-------------|----------|
| [`ecommerce-schema.json`](./ecommerce-schema.json) | Complete product catalog | E-commerce product data |
| [`saas-user-schema.json`](./saas-user-schema.json) | SaaS user management | User profiles, subscriptions |
| [`api-transaction-schema.json`](./api-transaction-schema.json) | Payment transactions | Financial API responses |
| [`team-with-users-schema.json`](./team-with-users-schema.json) | Team with member arrays | Arrays of nested objects example |
| [`quick-test-schema.json`](./quick-test-schema.json) | Simple test schema | Quick testing & demos |


## 📋 JSON Schema Compatibility

FoundryData supports modern JSON Schema versions:
- ✅ **Draft-07** (2017) - Default, most compatible
- ✅ **Draft 2019-09** - Enhanced validation
- ✅ **Draft 2020-12** - Latest features, OpenAPI 3.1

**Not supported:**
- ❌ Draft-04 (too old, use migration tools)
- ❌ Draft-03 (ancient)

The tool auto-detects your schema version from the `$schema` property.

## 🚀 Basic Usage

### Installation

```bash
# Install globally
npm install -g foundrydata

# Or use npx (no installation)
npx foundrydata generate --schema user.json --rows 10
```

### Generate Data

```bash
# Generate 100 products
foundrydata generate --schema ecommerce-schema.json --rows 100

# Deterministic output (same seed = same data)
foundrydata generate --schema saas-user-schema.json --rows 50 --seed 42

# Arrays of objects example
foundrydata generate --schema team-with-users-schema.json --rows 10

# Output to file
foundrydata generate --schema api-transaction-schema.json --rows 200 --output transactions.json

# Quick test
foundrydata generate --schema quick-test-schema.json --rows 5
```

## 💻 CLI Commands

| Command | Description |
|---------|-------------|
| `foundrydata generate --schema <file> --rows <num>` | Generate test data |
| `foundrydata generate --schema <file> --rows <num> --seed <num>` | Deterministic generation |
| `foundrydata generate --schema <file> --rows <num> --output <file>` | Output to file |
| `foundrydata help` | Show help |
| `foundrydata version` | Show version |

## ☁️ API Usage (Coming Month 3+ if requested)

**Note:** API is not yet available in MVP. CLI only for now.

**Note:** API architecture designed but not yet implemented.

```bash
# Future API usage (when built)
curl -X POST https://api.foundrydata.dev/generate \
  -H 'X-API-Key: foundry_live_your_key' \
  -H 'Content-Type: application/json' \
  -d '{
    "schema": {
      "type": "object", 
      "properties": {
        "id": {"type": "string", "format": "uuid"},
        "email": {"type": "string", "format": "email"}
      },
      "required": ["id", "email"]
    },
    "rows": 10
  }'

# CSV format will be API-only feature
# JSON is the only MVP format
```

## ✅ What's Supported in MVP

### Basic Types
- `type: string` - Any string
- `type: number` - Decimal numbers
- `type: integer` - Whole numbers
- `type: boolean` - true/false

### String Formats
- `format: uuid` - UUID v4
- `format: email` - Valid emails
- `format: date` - YYYY-MM-DD format
- `format: date-time` - ISO 8601 with timezone

### Constraints
- `minimum/maximum` - Number ranges (inclusive)
- `minLength/maxLength` - String length
- `enum` - Pick from list (cached for consistency)
- `required` - Required fields

### Arrays
- `type: array` with `items` of primitives (string, number, boolean)
- Arrays of nested objects (objects with nested properties up to depth 2)
- `minItems/maxItems` - Array length constraints

## ❌ Not Supported Yet

| Feature | Status | Workaround |
|---------|--------|------------|
| Deep nested objects (depth > 2) | Coming v0.3 | Restructure schema |
| Objects nested beyond depth 2 | Coming v0.3 | Restructure with intermediate objects |
| `pattern` (regex) | Coming v0.3 | Use formats |
| `allOf/oneOf` | Coming v0.3 | Pick one type |
| `$ref` | Coming v0.3 | Inline definitions |
| `exclusiveMinimum/exclusiveMaximum` | Coming v0.2 | Use inclusive ranges |

## 💬 Error Messages

FoundryData gives clear, helpful errors:

```bash
# Unsupported feature
❌ Error: Feature 'nested objects' not supported in MVP
💡 Suggestion: Restructure deeply nested schemas (depth > 2)
📅 Expected in: v0.3 (based on demand)
📧 Request priority: github.com/foundrydata/foundrydata/issues

# Invalid schema
❌ Error: Schema validation failed
🔍 Issue: Property 'type' is required at root level
💡 Fix: Add "type": "object" to your schema

# Unsupported format
❌ Error: Format 'sql' not supported in MVP
✅ Supported formats: json, csv
💡 Suggestion: Use JSON and convert later
```

## 🧪 Quick Test

Want to try FoundryData right now? Copy this schema to `test.json`:

```json
{
  "type": "object",
  "properties": {
    "id": {"type": "string", "format": "uuid"},
    "name": {"type": "string", "minLength": 2, "maxLength": 30},
    "email": {"type": "string", "format": "email"},
    "age": {"type": "integer", "minimum": 18, "maximum": 65},
    "premium": {"type": "boolean"},
    "tags": {
      "type": "array",
      "items": {"type": "string"},
      "minItems": 1,
      "maxItems": 3
    }
  },
  "required": ["id", "email"]
}
```

Then run:
```bash
npm install -g foundrydata
foundrydata generate --schema test.json --rows 5
```

## 📖 Real-World Examples

### E-commerce Product
```bash
foundrydata generate --schema ecommerce-schema.json --rows 100
```
Generates: SKUs, prices, categories, stock levels, ratings

### SaaS User Management
```bash
foundrydata generate --schema saas-user-schema.json --rows 50
```
Generates: Users, plans, subscriptions, usage limits

### Team with Member Arrays
```bash
foundrydata generate --schema team-with-users-schema.json --rows 10
```
Generates: Teams with arrays of nested user objects (demonstrates arrays of objects up to depth 2)

### API Transaction Data
```bash
foundrydata generate --schema api-transaction-schema.json --rows 200
```
Generates: Payment transactions, statuses, fees, timestamps

## 🎯 Schema Compatibility Check

**✅ Will work (v0.1):**
- Nested objects with basic types (up to depth 2)
- Arrays of primitives (string, number, boolean)
- Arrays of nested objects (objects with nested properties up to depth 2)
- String formats (uuid, email, date, date-time)
- Number constraints (min/max inclusive only)
- String constraints (minLength/maxLength)
- Enums and required fields

**❌ Won't work (v0.1):**
- Nested objects (object properties with object type)
- Objects nested 2+ levels deep
- Complex patterns, regex validation
- Schema references ($ref)
- Exclusive minimum/maximum ranges

## 🆘 Need Help?

- 🐛 **Bug?** [Open an issue](https://github.com/foundrydata/foundrydata/issues)
- 💡 **Feature request?** [Start a discussion](https://github.com/foundrydata/foundrydata/discussions)
- 💬 **Questions?** Check existing issues first
- 💰 **Need API access?** [foundrydata.dev](https://foundrydata.dev)

---

**Remember:** FoundryData guarantees 100% schema compliance or tells you exactly why it can't generate your data. No surprises, no broken validation!