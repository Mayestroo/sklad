import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServiceActPayload, type ServiceActForm } from './service-act.ts';

const form = (overrides: Partial<ServiceActForm> = {}): ServiceActForm => ({
  type: 'PROVIDED',
  counterpartyId: 'cp-1',
  actDate: '2026-11-12',
  currency: 'UZS',
  exchangeRate: 1,
  items: [{ serviceName: 'Yetkazib berish', unit: 'piece', quantity: 2, unitPrice: 50000, vatRate: 12 }],
  ...overrides,
});

test('a foreign-currency act without an exchange rate is rejected, never booked at rate 1 (ADR 0022)', () => {
  const result = buildServiceActPayload(form({ currency: 'USD', exchangeRate: 0 }), 'uz');
  assert.equal(result.ok, false);
});

test('a USD act carries the rate the user entered', () => {
  const result = buildServiceActPayload(form({ currency: 'USD', exchangeRate: 12800 }), 'uz');
  assert.ok(result.ok);
  assert.equal(result.payload.exchangeRate, 12800);
});

test('a UZS act is always at rate 1', () => {
  const result = buildServiceActPayload(form({ currency: 'UZS', exchangeRate: 0 }), 'uz');
  assert.ok(result.ok);
  assert.equal(result.payload.exchangeRate, 1);
});

test('lines keep the quantity and price the user typed instead of defaulting them', () => {
  const zeroQty = buildServiceActPayload(
    form({ items: [{ serviceName: 'X', unit: 'piece', quantity: 0, unitPrice: 100, vatRate: 0 }] }),
    'uz',
  );
  assert.equal(zeroQty.ok, false);

  const negativePrice = buildServiceActPayload(
    form({ items: [{ serviceName: 'X', unit: 'piece', quantity: 1, unitPrice: -5, vatRate: 0 }] }),
    'uz',
  );
  assert.equal(negativePrice.ok, false);

  const ok = buildServiceActPayload(form(), 'uz');
  assert.ok(ok.ok);
  assert.deepEqual(ok.payload.items[0], {
    productId: undefined,
    serviceName: 'Yetkazib berish',
    description: undefined,
    unit: 'piece',
    quantity: 2,
    unitPrice: 50000,
    vatRate: 12,
  });
});
