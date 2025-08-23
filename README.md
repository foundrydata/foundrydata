<div align="center">
  <br />
  <img src="https://raw.githubusercontent.com/foundrydata/foundrydata/main/assets/banner.svg"  alt="FoundryData Logo"/>
  <br />
  <br />
  
  <h1>FoundryData</h1>
  
  <p>
    <strong>Generate test data from JSON Schema. 100% compliant or we tell you why.</strong>
  </p>
  
  <p>
    <a href="https://www.npmjs.com/package/foundrydata"><img src="https://img.shields.io/npm/v/foundrydata?style=flat-square&labelColor=000000&color=3b82f6" alt="npm version" /></a>
    <a href="https://github.com/foundrydata/foundrydata/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square&labelColor=000000" alt="MIT License" /></a>
    <a href="https://github.com/foundrydata/foundrydata/stargazers"><img src="https://img.shields.io/github/stars/foundrydata/foundrydata?style=flat-square&labelColor=000000&color=3b82f6" alt="GitHub stars" /></a>
    <a href="https://www.npmjs.com/package/foundrydata"><img src="https://img.shields.io/npm/dm/foundrydata?style=flat-square&labelColor=000000&color=3b82f6" alt="npm downloads" /></a>
    <a href="https://github.com/foundrydata/foundrydata/actions"><img src="https://img.shields.io/github/actions/workflow/status/foundrydata/foundrydata/ci.yml?style=flat-square&labelColor=000000" alt="Build Status" /></a>
  </p>
  
  <p>
    <a href="#-features">Features</a> •
    <a href="#-quick-start">Quick Start</a> •
    <a href="#-why-foundrydata">Why?</a> •
    <a href="#-examples">Examples</a> •
    <a href="#-api">API</a> •
    <a href="#-contributing">Contributing</a>
  </p>
  
  <br />
  
  <img src="https://raw.githubusercontent.com/foundrydata/foundrydata/main/assets/demo.gif" width="700" alt="FoundryData Demo" />
</div>

<br />

## ✨ Features

- 🎯 **100% Schema Compliance** - Every generated row is validated against your schema
- 🚀 **CLI First** - Run locally, no account needed, no data leaves your machine
- 📦 **Fully Open Source** - MIT licensed, audit the code, contribute features
- ⚡ **Blazing Fast** - Generate 10,000 rows in under a second
- 🔧 **Zero Config** - Just point to your schema and go
- 🎲 **Deterministic** - Same seed = same data, perfect for tests
- 🛠️ **Developer Friendly** - Clear errors when schemas aren't supported

## 🚀 Quick Start

```bash
# Install globally
npm install -g foundrydata

# Create a schema file (user.json)
echo '{
  "type": "object",
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "email": { "type": "string", "format": "email" },
    "age": { "type": "integer", "minimum": 18, "maximum": 99 }
  },
  "required": ["id", "email"]
}' > user.json

# Generate 100 test users
foundrydata generate --schema user.json --rows 100

# Output:
# ✅ Generated 100 rows (125ms)
# [
#   {
#     "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
#     "email": "john.doe@example.com",
#     "age": 42
#   },
#   ...
# ]
```

## 🤔 Why FoundryData?

**The Problem:** Every test data generator produces "realistic" data that violates your schema constraints.

**Our Solution:** FoundryData reads your JSON Schema and generates data that's **guaranteed** to pass validation. If we can't guarantee compliance, we tell you exactly why.

### FoundryData vs Others

| Feature | FoundryData | Faker.js | Mockaroo | JSON Generator |
|---------|------------|----------|----------|----------------|
| Schema Validation | ✅ 100% | ❌ None | ⚠️ Partial | ⚠️ Basic |
| Open Source | ✅ MIT | ✅ MIT | ❌ No | ⚠️ Freemium |
| CLI Tool | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| Deterministic | ✅ Yes | ✅ Yes | ⚠️ Limited | ✅ Yes |
| Clear Errors | ✅ Yes | N/A | ❌ No | ❌ No |

## 📚 Examples

### Basic Usage

```bash
# Generate with deterministic seed (same data every time)
foundrydata generate --schema user.json --rows 50 --seed 42

# Output to file
foundrydata generate --schema user.json --rows 1000 --output users.json

# Pretty print output
foundrydata generate --schema user.json --rows 10 --pretty
```

### Supported Schema Features

```javascript
{
  "type": "object",
  "properties": {
    // ✅ Basic types
    "name": { "type": "string", "minLength": 2, "maxLength": 50 },
    "age": { "type": "integer", "minimum": 0, "maximum": 120 },
    "score": { "type": "number", "minimum": 0.0, "maximum": 100.0 },
    "active": { "type": "boolean" },
    
    // ✅ String formats
    "id": { "type": "string", "format": "uuid" },
    "email": { "type": "string", "format": "email" },
    "birthday": { "type": "string", "format": "date" },
    "created": { "type": "string", "format": "date-time" },
    
    // ✅ Enums
    "role": { "type": "string", "enum": ["admin", "user", "guest"] },
    
    // ❌ Not supported yet (coming soon!)
    "tags": { "type": "array" },  // Arrays - v0.2
    "address": { "type": "object" },  // Nested objects - v0.3
  },
  "required": ["id", "email"]
}
```

### Clear Error Messages

```bash
# When using unsupported features
foundrydata generate --schema complex.json

# ❌ Error: Schema features not supported in v0.1
# 
# Unsupported features detected:
#   - Nested objects at: properties.address
#   - Arrays at: properties.tags
# 
# 💡 Workaround: Flatten nested objects or generate them separately
# 📅 These features are planned for v0.2 (February 2025)
# 
# Want them sooner? Vote or contribute:
# https://github.com/foundrydata/foundrydata/issues
```

## ☁️ API Access (Optional)

Need to generate data in CI/CD pipelines? Don't want to install anything?

```bash
# Cloud API available for teams (€29/month)
curl -X POST https://api.foundrydata.dev/generate \
  -H 'X-API-Key: your_api_key' \
  -H 'Content-Type: application/json' \
  -d '{
    "schema": { ... },
    "rows": 100
  }'
```

The CLI will **always** be free and open source. The API funds continued development.

[Get API Access →](https://foundrydata.dev)

## 🤝 Contributing

We love contributions! FoundryData is 100% open source and community-driven.

```bash
# Clone the repo
git clone https://github.com/foundrydata/foundrydata.git
cd foundrydata

# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Submit your PR!
```

See [CONTRIBUTING.md](https://github.com/foundrydata/foundrydata/blob/main/CONTRIBUTING.md) for more details.

### Good First Issues

- [ ] Add `format: ipv4` support
- [ ] Add `format: hostname` support
- [ ] Improve error messages
- [ ] Add more examples
- [ ] Translate documentation

## 📊 Project Status

- **Current Version:** v0.1.0 (MVP)
- **Next Release:** v0.2.0 (Arrays support)
- **Stable API:** v1.0.0 (Q2 2025)

See our [Public Roadmap](https://github.com/foundrydata/foundrydata/projects/1) for what's coming next.

## 🏗️ Architecture

```
foundrydata/
├── packages/
│   ├── @foundrydata/core    # Core generation logic
│   └── foundrydata          # CLI wrapper
├── examples/                # Sample schemas
└── docs/                    # Documentation
```

## 📈 Stats

![Repobeats](https://repobeats.axiom.co/api/embed/foundrydata.svg "Repobeats analytics")

## 🙏 Acknowledgements

Built on top of these awesome projects:
- [Faker.js](https://github.com/faker-js/faker) - For base data generation
- [AJV](https://github.com/ajv-validator/ajv) - For schema validation
- [Commander.js](https://github.com/tj/commander.js) - For CLI interface

## 📄 License

MIT © [FoundryData Contributors](https://github.com/foundrydata/foundrydata/graphs/contributors)

---

<div align="center">
  <p>
    <sub>Built with ❤️ by <a href="https://github.com/fstepho">@fstepho</a> and <a href="https://github.com/foundrydata/foundrydata/graphs/contributors">contributors</a></sub>
  </p>
  <p>
    <a href="https://github.com/foundrydata/foundrydata/stargazers">⭐ Star us on GitHub!</a> •
    <a href="https://twitter.com/foundrydata">𝕏 Follow on Twitter</a> •
    <a href="https://foundrydata.dev">🌐 Website</a>
  </p>
</div>
