# FoundryData Examples & Usage Guide

This directory contains real-world schema examples and usage patterns for FoundryData.

## 📋 Available Schemas

### ✅ Fully Supported (MVP v0.1)

| Schema | Description | Use Case |
|--------|-------------|----------|
| [`ecommerce-schema.json`](./ecommerce-schema.json) | Complete product catalog | E-commerce product data |
| [`saas-user-schema.json`](./saas-user-schema.json) | SaaS user management | User profiles, subscriptions |
| [`api-transaction-schema.json`](./api-transaction-schema.json) | Payment transactions | Financial API responses |
| [`quick-test-schema.json`](./quick-test-schema.json) | Simple test schema | Quick testing & demos |

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

## ☁️ API Usage (Pro Plan)

```bash
# Generate via API
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

# Generate CSV format
curl -X POST https://api.foundrydata.dev/generate \
  -H 'X-API-Key: foundry_live_your_key' \
  -H 'Content-Type: application/json' \
  -d '{
    "schema": {...},
    "rows": 100,
    "format": "csv"
  }'
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
- `minimum/maximum` - Number ranges
- `minLength/maxLength` - String length
- `enum` - Pick from list
- `required` - Required fields

### Arrays (Basic Support)
- `type: array` with `items` of basic types (string, number, boolean)
- `minItems/maxItems` - Array length constraints

## ❌ Not Supported Yet

| Feature | Status | Workaround |
|---------|--------|------------|
| Nested objects | Coming v2 | Flatten schema |
| Arrays of objects | Coming v2 | Generate separately |
| `pattern` (regex) | Coming v3 | Use formats |
| `allOf/oneOf` | Coming v3 | Pick one type |
| `$ref` | Coming v3 | Inline definitions |

## 💬 Error Messages

FoundryData gives clear, helpful errors:

```bash
# Unsupported feature
❌ Error: Feature 'nested objects' not supported in MVP
💡 Suggestion: Flatten your schema structure
📅 Expected in: v2 (based on demand)
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

### API Transaction Data
```bash
foundrydata generate --schema api-transaction-schema.json --rows 200
```
Generates: Payment transactions, statuses, fees, timestamps

## 🎯 Schema Compatibility Check

**✅ Will work:**
- Flat objects with basic types
- Arrays of basic types (string, number, boolean)
- String formats (uuid, email, date)
- Number constraints (min/max)
- Enums and required fields

**❌ Won't work (yet):**
- Nested objects
- Arrays of objects
- Complex patterns
- Schema references

## 🆘 Need Help?

- 🐛 **Bug?** [Open an issue](https://github.com/foundrydata/foundrydata/issues)
- 💡 **Feature request?** [Start a discussion](https://github.com/foundrydata/foundrydata/discussions)
- 💬 **Questions?** Check existing issues first
- 💰 **Need API access?** [foundrydata.dev](https://foundrydata.dev)

---

**Remember:** FoundryData guarantees 100% schema compliance or tells you exactly why it can't generate your data. No surprises, no broken validation!