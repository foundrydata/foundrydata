# G_valid example — array with UUID + `contains`

This example illustrates a `G_valid v1` array motif where the Generator, not the Repair engine, is responsible for producing a structurally valid element that satisfies both the `items` schema and a `contains` constraint on a UUID field.

It is derived from the canonical Generator / Repair contract and `G_valid` definitions (see anchors `spec://§6#generator-repair-contract`, `spec://§9#generator`, `spec://§9#arrays-contains`) and is meant as a reference example for tests and documentation. The prose below is an explanatory rephrasing, not a copy of the SPEC text.

## Schema

We model a simple list of order items. Each item has a UUID identifier and a boolean flag indicating whether the item is a gift. The array requires at least one gift item by using `contains`:

```json
{
  "$id": "https://example.com/schemas/order-items-gvalid-uuid-contains.json",
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "format": "uuid"
      },
      "isGift": {
        "type": "boolean"
      }
    },
    "required": ["id", "isGift"],
    "additionalProperties": true
  },
  "minItems": 1,
  "contains": {
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "format": "uuid"
      },
      "isGift": {
        "const": true
      }
    },
    "required": ["id", "isGift"]
  }
}
```

This schema is intentionally kept within the baseline `G_valid v1` scope:

- the effective array type is simple (`type: "array"` with a single `items` schema),
- there is no `additionalProperties: false` or `unevaluated*` interplay on the array or the item objects,
- the `contains` clause is compatible with the `items` schema (it only tightens constraints on existing fields).

Under the canonical classification, the array location can be treated as part of `G_valid v1` for the UUID + `contains` motif.

## Behaviour outside vs inside `G_valid`

Before the Generator / Repair contract and `G_valid v1` were introduced, a minimal‑witness strategy could legitimately:

- emit an array where the first element only partially satisfied the `items` schema (for example missing `isGift`),
- rely on the Repair engine to add missing required properties or adjust the structure so that `contains` is satisfied.

For `G_valid v1`, the behaviour is strengthened at this array location:

- the Generator is expected to use the effective `items` + `contains` view to produce at least one element that already satisfies both the object shape and the `contains` condition (i.e. `id` is a UUID and `isGift` is `true`), and
- the pre‑Repair candidate must be AJV‑valid for the structural keywords relevant to this array (type, required keys on the item object, `minItems`, and the `contains` requirement).

In other words, the UUID + `contains` requirement is treated as part of the Generator’s own obligations for this array; it is not delegated to Repair.

## Repair expectations in the `G_valid` zone

The Repair engine still runs after generation, but its role at this `G_valid` location is intentionally constrained:

- acceptable actions focus on low‑impact adjustments (for example numeric or format nudges elsewhere in the document, or `uniqueItems` deduplication if the schema adds that constraint later),
- Repair is not relied upon to add missing required properties to the order items or to “manufacture” a gift element to satisfy `contains`.

If a future change causes structural Repair actions under the array location (for example adding `isGift` or an entire item to satisfy `contains`), this should be treated as a regression against the Generator / Repair contract for `G_valid` and surfaced through the dedicated `gValid_*` metrics rather than being considered an acceptable behaviour.

