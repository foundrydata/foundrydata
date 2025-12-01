# JSON Schema Report – examples/payment.json

- Tool: json-schema-reporter 0.1.0
- Engine: 0.1.1
- Timestamp: 2025-11-30T23:17:22.710Z
- Seed: 424242
- Instances: 3
  - valid (unchanged): 3
  - valid (repaired): 0
  - invalid: 0

## Timings

| Step | Duration (ms) |
|---|---|
| normalize | 1.2771669999999915 |
| compose | 6.190624999999983 |
| generate | 1.6806669999999997 |
| repair | 21.276916 |
| validate | 14.308917000000008 |

## Diagnostics

### Summary
- Normalize notes: 0
- Compose fatal: 0
- Compose warn: 0
- Compose unsat hints: 0
- Compose run-level: 1
- Repair budget exhausted: 0
- Validate errors: 0

### Compose diagnostics
- fatal: none
- warn: none
- unsatHints: none
- run: 1
  - RESOLVER_STRATEGIES_APPLIED @ # ({"strategies":["local"],"requested":["local"],"cacheDir":"~/.foundrydata/cache"})

## Coverage Index (snapshot)

| canonPath | hasUniverse | enumeratedKeys | provenance |
|---|---|---|---|
| # | finite | amount, createdAt, currency, id (+2 more) | properties |
| /properties/metadata | unknown | — |  |

## Instances

### Instance #0 — valid-unchanged

```json
{
  "amount": 0,
  "createdAt": "2024-04-27T10:55:46.000Z",
  "currency": "USD",
  "id": "15682b96-a105-4f9e-b444-c8ab372f94cb",
  "status": "pending"
}
```
- validation errors: 0 | repair actions: 0

### Instance #1 — valid-unchanged

```json
{
  "amount": 0,
  "createdAt": "2024-09-23T18:32:48.000Z",
  "currency": "USD",
  "id": "e3230563-bf2b-4d28-aa28-7b28f194bfe3",
  "status": "pending"
}
```
- validation errors: 0 | repair actions: 0

### Instance #2 — valid-unchanged

```json
{
  "amount": 0,
  "createdAt": "2024-05-27T10:44:43.000Z",
  "currency": "USD",
  "id": "c9afef45-822f-4cb2-9cf7-b2d03c276746",
  "status": "pending"
}
```
- validation errors: 0 | repair actions: 0
