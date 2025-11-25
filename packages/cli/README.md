# FoundryData CLI

`foundrydata` is the command‑line interface for the FoundryData engine. It generates deterministic, contract‑true test data from JSON Schema and OpenAPI 3.1.

## Quick start

```bash
npx foundrydata generate \
  --schema ./examples/user.schema.json \
  --n 5 \
  --seed 42
```

This will compile your schema with AJV, generate 5 valid instances, and print them as JSON/NDJSON depending on your flags.

For a full product overview, pipeline details, and CI examples, see the main project README:

- https://github.com/foundrydata/foundrydata#readme

