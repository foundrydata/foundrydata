# JSON Schema Report – examples/ecommerce-complex-schema.json

- Tool: json-schema-reporter 0.1.0
- Engine: 0.1.1
- Timestamp: 2025-12-02T21:54:41.040Z
- Seed: 424242
- Instances: 3
  - valid (unchanged): 3
  - valid (repaired): 0
  - invalid: 0

## Timings

| Step | Duration (ms) |
|---|---|
| normalize | 5.603082999999998 |
| compose | 24.133375 |
| generate | 58.453958 |
| repair | 36.104667000000006 |
| validate | 30.65170900000001 |

## Diagnostics

### Summary
- Normalize notes: 1
- Compose fatal: 0
- Compose warn: 2
- Compose unsat hints: 0
- Compose run-level: 1
- Repair budget exhausted: 0
- Validate errors: 0

### Compose diagnostics
- fatal: none
- warn: 2
  - CONTAINS_BAG_COMBINED @ /properties/items ({"bagSize":1,"sumMin":1,"maxItems":100})
  - NAME_AUTOMATON_BFS_APPLIED @ /properties/customAttributes ({"budget":{"maxMillis":40,"maxStates":8000,"maxQueue":16000,"maxDepth":12,"maxResults":32,"beamWidth":128},"nodesExpa…)
- unsatHints: none
- run: 1
  - RESOLVER_STRATEGIES_APPLIED @ # ({"strategies":["local"],"requested":["local"],"cacheDir":"~/.foundrydata/cache"})

## Coverage Index (snapshot)

| canonPath | hasUniverse | enumeratedKeys | provenance |
|---|---|---|---|
| # | finite | auditTrail, billingAddress, cancellation, completedAt (+21 more) | properties |
| /allOf/0/if | unknown | — |  |
| /allOf/0/then | unknown | — |  |
| /allOf/1/if | unknown | — |  |
| /allOf/1/then | unknown | — |  |
| /allOf/1/then/properties/shipping | unknown | — |  |
| /allOf/2/if | unknown | — |  |
| /allOf/2/then | unknown | — |  |
| /allOf/3/if | unknown | — |  |
| /allOf/3/then | unknown | — |  |
| /allOf/4/not | unknown | — |  |
| /properties/customer | finite | email, firstName, id, isGuest (+5 more) | properties |
| /properties/customer/allOf/0/anyOf/0/not | unknown | — |  |
| /properties/customer/allOf/0/anyOf/1 | unknown | — |  |
| /properties/items/contains | unknown | — |  |
| /properties/notes | finite | customer, internal | properties |
| /properties/notes/properties/internal/items | finite | author, createdAt, text | properties |
| /properties/metadata | unknown | — |  |
| /properties/customAttributes | finite | x-0, x-00, x-000, x-00A (+28 more) | patternProperties |
| /properties/source | finite | campaign, channel, deviceId, ip (+3 more) | properties |
| /properties/source/properties/campaign | finite | content, medium, name, source (+1 more) | properties |
| /properties/extensions | unknown | — |  |
| /properties/extensions/properties/core | finite | source | properties |
| /properties/extensions/unevaluatedProperties | finite | notes, value | properties |
| /properties/auditTrail/unevaluatedItems | finite | field, newValue, oldValue, reason | properties |
| /$defs/money | finite | amount, currency | properties |
| /$defs/address | finite | city, coordinates, country, postalCode (+3 more) | properties |
| /$defs/address/properties/coordinates | finite | lat, lng | properties |
| /$defs/contact | finite | email, firstName, lastName, phone (+1 more) | properties |
| /$defs/basePayment | unknown | — |  |
| /$defs/cardPayment/allOf/1 | unknown | — |  |
| /$defs/cardPayment/allOf/1/properties/card | finite | brand, expiryMonth, expiryYear, fingerprint (+3 more) | properties |
| /$defs/paypalPayment/allOf/1 | unknown | — |  |
| /$defs/paypalPayment/allOf/1/properties/paypal | finite | payerEmail, payerId, transactionId | properties |
| /$defs/bankTransferPayment/allOf/1 | unknown | — |  |
| /$defs/bankTransferPayment/allOf/1/properties/bankTransfer | finite | bic, dueDate, iban, reference | properties |
| /$defs/giftCardPayment/allOf/1 | unknown | — |  |
| /$defs/giftCardPayment/allOf/1/properties/giftCard | finite | code, originalBalance, pin, usedAmount | properties |
| /$defs/productVariant | finite | attributes, name, sku | properties |
| /$defs/productVariant/properties/attributes | unknown | — |  |
| /$defs/orderItem | finite | customization, discount, giftMessage, id (+5 more) | properties |
| /$defs/orderItem/allOf/0/anyOf/0/not | unknown | — |  |
| /$defs/orderItem/allOf/0/anyOf/1 | unknown | — |  |
| /$defs/orderItem/properties/discount | finite | reason, type, value | properties |
| /$defs/orderItem/properties/customization | finite | engraving, notes, wrapping | properties |
| /$defs/promotion | finite | applicableCategories, buyQuantity, code, getQuantity (+8 more) | properties |
| /$defs/promotion/allOf/0/if | unknown | — |  |
| /$defs/promotion/allOf/0/then | unknown | — |  |
| /$defs/promotion/allOf/1/if | unknown | — |  |
| /$defs/promotion/allOf/1/then | unknown | — |  |
| /$defs/promotion/allOf/2/if | unknown | — |  |
| /$defs/promotion/allOf/2/then | unknown | — |  |
| /$defs/shippingMethod | finite | carrier, deliveryInstructions, estimatedDelivery, insurance (+6 more) | properties |
| /$defs/shippingMethod/if | unknown | — |  |
| /$defs/shippingMethod/then | unknown | — |  |
| /$defs/shippingMethod/properties/estimatedDelivery | finite | estimatedDate, maxDays, minDays | properties |
| /$defs/shippingMethod/properties/insurance | finite | enabled, provider, value | properties |
| /$defs/shippingMethod/properties/pickupPoint | finite | address, id, name, openingHours | properties |
| /$defs/shippingMethod/properties/pickupPoint/properties/openingHours | finite | friday, monday, saturday, sunday (+3 more) | properties |
| /$defs/shippingMethod/dependentSchemas/carrier/if | unknown | — |  |
| /$defs/shippingMethod/dependentSchemas/carrier/then | unknown | — |  |
| /$defs/dayHours/anyOf/1 | finite | close, open | properties |
| /$defs/orderTimeline/items | finite | actor, event, metadata, note (+1 more) | properties |
| /$defs/orderTimeline/items/properties/actor | finite | id, name, type | properties |
| /$defs/orderTimeline/items/properties/metadata | unknown | — |  |
| /$defs/orderTotals | finite | discounts, shipping, subtotal, tax (+1 more) | properties |
| /$defs/orderTotals/properties/tax | finite | amount, breakdown, rate | properties |
| /$defs/orderTotals/properties/tax/properties/breakdown/items | finite | amount, name, rate | properties |
| /$defs/cancellation | finite | details, processedAt, reason, requestedAt (+1 more) | properties |

## Instances

### Instance #0 — valid-unchanged

```json
{
  "billingAddress": {
    "city": "-",
    "country": "AA",
    "postalCode": "--",
    "street": "-"
  },
  "createdAt": "2024-04-27T10:55:46.000Z",
  "customer": {
    "email": "user.1lctcj5@example.test",
    "firstName": "-",
    "lastName": "-",
    "loyaltyPoints": 0,
    "loyaltyTier": "bronze"
  },
  "id": "15682b96-a105-4f9e-b444-c8ab372f94cb",
  "items": [
    {
      "giftMessage": "",
      "id": "e3230563-bf2b-4d28-aa28-7b28f194bfe3",
      "isGift": true,
      "product": {
        "name": "-",
        "sku": "AA-0000"
      },
      "quantity": 1,
      "totalPrice": {
        "amount": 0,
        "currency": "AAA"
      },
      "unitPrice": {
        "amount": 0,
        "currency": "AAA"
      }
    }
  ],
  "orderNumber": "ORD-0000-AAAAAAAA",
  "payments": [
    {
      "amount": {
        "amount": 0,
        "currency": "AAA"
      },
      "card": {
        "brand": "visa",
        "expiryMonth": 1,
        "expiryYear": 2024,
        "holderName": "--",
        "last4": "0000"
      },
      "id": "c9afef45-822f-4cb2-9cf7-b2d03c276746",
      "method": "card",
      "status": "pending"
    }
  ],
  "shipping": {
    "carrier": "colissimo",
    "estimatedDelivery": {
      "maxDays": 0,
      "minDays": 0
    },
    "price": {
      "amount": 0,
      "currency": "AAA"
    }
  },
  "source": {
    "channel": "web"
  },
  "status": "draft",
  "timeline": [
    {
      "actor": {
        "type": "customer"
      },
      "event": "created",
      "timestamp": "2024-09-23T18:32:48.000Z"
    }
  ],
  "totals": {
    "shipping": {
      "amount": 0,
      "currency": "AAA"
    },
    "subtotal": {
      "amount": 0,
      "currency": "AAA"
    },
    "tax": {
      "amount": {
        "amount": 0,
        "currency": "AAA"
      },
      "rate": 0
    },
    "total": {
      "amount": 0,
      "currency": "AAA"
    }
  },
  "updatedAt": "2024-05-27T10:44:43.000Z",
  "version": 1
}
```
- validation errors: 0 | repair actions: 0

### Instance #1 — valid-unchanged

```json
{
  "billingAddress": {
    "city": "-",
    "country": "AA",
    "postalCode": "--",
    "street": "-"
  },
  "createdAt": "2024-04-19T21:32:37.000Z",
  "customer": {
    "email": "user.15tpt65@example.test",
    "firstName": "-",
    "lastName": "-",
    "loyaltyPoints": 0,
    "loyaltyTier": "bronze"
  },
  "id": "f327713c-343d-4609-9490-db163474e5fc",
  "items": [
    {
      "giftMessage": "",
      "id": "26ea8538-0670-4c3d-b0d7-71ce571b7a65",
      "isGift": true,
      "product": {
        "name": "-",
        "sku": "AA-0000"
      },
      "quantity": 1,
      "totalPrice": {
        "amount": 0,
        "currency": "AAA"
      },
      "unitPrice": {
        "amount": 0,
        "currency": "AAA"
      }
    }
  ],
  "orderNumber": "ORD-0000-AAAAAAAA",
  "payments": [
    {
      "amount": {
        "amount": 0,
        "currency": "AAA"
      },
      "card": {
        "brand": "visa",
        "expiryMonth": 1,
        "expiryYear": 2024,
        "holderName": "--",
        "last4": "0000"
      },
      "id": "8a4d6fd9-45a9-4c2b-bf9d-be785b2f2cca",
      "method": "card",
      "status": "pending"
    }
  ],
  "shipping": {
    "carrier": "colissimo",
    "estimatedDelivery": {
      "maxDays": 0,
      "minDays": 0
    },
    "price": {
      "amount": 0,
      "currency": "AAA"
    }
  },
  "source": {
    "channel": "web"
  },
  "status": "draft",
  "timeline": [
    {
      "actor": {
        "type": "customer"
      },
      "event": "created",
      "timestamp": "2024-08-16T07:23:01.000Z"
    }
  ],
  "totals": {
    "shipping": {
      "amount": 0,
      "currency": "AAA"
    },
    "subtotal": {
      "amount": 0,
      "currency": "AAA"
    },
    "tax": {
      "amount": {
        "amount": 0,
        "currency": "AAA"
      },
      "rate": 0
    },
    "total": {
      "amount": 0,
      "currency": "AAA"
    }
  },
  "updatedAt": "2024-09-29T02:27:52.000Z",
  "version": 1
}
```
- validation errors: 0 | repair actions: 0

### Instance #2 — valid-unchanged

```json
{
  "billingAddress": {
    "city": "-",
    "country": "AA",
    "postalCode": "--",
    "street": "-"
  },
  "createdAt": "2024-04-19T08:27:33.000Z",
  "customer": {
    "email": "user.3pqtbd@example.test",
    "firstName": "-",
    "lastName": "-",
    "loyaltyPoints": 0,
    "loyaltyTier": "bronze"
  },
  "id": "613a16e1-cc20-4bed-ad6d-5ea91c0c9cf8",
  "items": [
    {
      "giftMessage": "",
      "id": "1b3e0888-3e26-4876-a93e-943f210279b2",
      "isGift": true,
      "product": {
        "name": "-",
        "sku": "AA-0000"
      },
      "quantity": 1,
      "totalPrice": {
        "amount": 0,
        "currency": "AAA"
      },
      "unitPrice": {
        "amount": 0,
        "currency": "AAA"
      }
    }
  ],
  "orderNumber": "ORD-0000-AAAAAAAA",
  "payments": [
    {
      "amount": {
        "amount": 0,
        "currency": "AAA"
      },
      "card": {
        "brand": "visa",
        "expiryMonth": 1,
        "expiryYear": 2024,
        "holderName": "--",
        "last4": "0000"
      },
      "id": "501be0b3-b521-42a1-af9a-6a5bb0a8d00f",
      "method": "card",
      "status": "pending"
    }
  ],
  "shipping": {
    "carrier": "colissimo",
    "estimatedDelivery": {
      "maxDays": 0,
      "minDays": 0
    },
    "price": {
      "amount": 0,
      "currency": "AAA"
    }
  },
  "source": {
    "channel": "web"
  },
  "status": "draft",
  "timeline": [
    {
      "actor": {
        "type": "customer"
      },
      "event": "created",
      "timestamp": "2024-04-13T12:02:40.000Z"
    }
  ],
  "totals": {
    "shipping": {
      "amount": 0,
      "currency": "AAA"
    },
    "subtotal": {
      "amount": 0,
      "currency": "AAA"
    },
    "tax": {
      "amount": {
        "amount": 0,
        "currency": "AAA"
      },
      "rate": 0
    },
    "total": {
      "amount": 0,
      "currency": "AAA"
    }
  },
  "updatedAt": "2024-02-27T23:37:32.000Z",
  "version": 1
}
```
- validation errors: 0 | repair actions: 0
