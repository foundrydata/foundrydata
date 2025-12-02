import { describe, it, expect } from 'vitest';

import { normalize } from '../../transform/schema-normalizer';
import { compose } from '../../transform/composition-engine';
import { generateFromCompose } from '../foundry-generator';

describe('Array generation — items + contains for orderItem', () => {
  it('generates items that satisfy both items and contains schemas', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $defs: {
        uuid: {
          type: 'string',
          format: 'uuid',
        },
        productVariant: {
          type: 'object',
          properties: {
            sku: {
              type: 'string',
              pattern: '^[A-Z]{2,4}-\\d{4,8}(-[A-Z0-9]+)?$',
            },
            name: { type: 'string' },
          },
          required: ['sku', 'name'],
          additionalProperties: false,
        },
        orderItem: {
          type: 'object',
          properties: {
            id: { $ref: '#/$defs/uuid' },
            product: { $ref: '#/$defs/productVariant' },
            quantity: { type: 'integer', minimum: 1, default: 1 },
            unitPrice: {
              type: 'object',
              properties: {
                amount: { type: 'number', minimum: 0 },
                currency: { type: 'string' },
              },
              required: ['amount', 'currency'],
              additionalProperties: false,
            },
            totalPrice: {
              type: 'object',
              properties: {
                amount: { type: 'number', minimum: 0 },
                currency: { type: 'string' },
              },
              required: ['amount', 'currency'],
              additionalProperties: false,
            },
            isGift: { type: 'boolean' },
            giftMessage: { type: 'string' },
          },
          required: ['id', 'product', 'quantity', 'unitPrice', 'totalPrice'],
          additionalProperties: false,
        },
      },
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: { $ref: '#/$defs/orderItem' },
          contains: {
            type: 'object',
            properties: {
              isGift: { const: true },
            },
            required: ['isGift'],
          },
          minContains: 1,
          minItems: 1,
        },
      },
      required: ['items'],
      additionalProperties: false,
    } as const;

    const eff = compose(normalize(schema));
    const out = generateFromCompose(eff, {
      seed: 4242,
      planOptions: { metrics: false },
    });
    const root = out.items[0] as { items?: unknown[] };

    expect(root && Array.isArray(root.items)).toBe(true);
    const [orderItem] = root.items ?? [];
    expect(orderItem && typeof orderItem === 'object').toBe(true);

    const oi = orderItem as {
      id?: unknown;
      isGift?: unknown;
      product?: { sku?: unknown; name?: unknown };
    };

    // contains witness preserved
    expect(oi.isGift).toBe(true);
    // items schema respected: id present and product.sku/name present
    expect(typeof oi.id).toBe('string');
    expect(oi.product && typeof oi.product === 'object').toBe(true);
    expect(typeof oi.product?.sku).toBe('string');
    expect(typeof oi.product?.name).toBe('string');
  });
});
